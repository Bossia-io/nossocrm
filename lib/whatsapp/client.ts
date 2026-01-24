/**
 * WhatsApp Baileys Client
 * @file lib/whatsapp/client.ts
 * @description WebSocket connection manager for Baileys WhatsApp integration
 * Server-only module (uses server-only directive)
 */

import 'server-only';

import { Boom } from '@hapi/boom';
import {
  makeWASocket,
  useMultiFileAuthState,
  WASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  AuthenticationCreds,
  SignalAuthStateStore,
} from '@whiskeysockets/baileys';
import { createServerClient } from '@/lib/supabase/server';
import {
  WhatsAppInboundPayload,
  WhatsAppProviderType,
  WhatsAppProvider,
} from '@/types/whatsapp';
import { logger } from '@/lib/logger';

/**
 * Baileys provider implementation
 * Manages WebSocket connection to WhatsApp Web
 */
class BaileysProvider implements WhatsAppProvider {
  readonly type: WhatsAppProviderType = 'baileys';

  private socket: WASocket | null = null;
  private organizationId: string | null = null;
  private isConnecting = false;

  /**
   * Initialize Baileys connection
   * @param organizationId - Organization context for multi-tenant isolation
   */
  async connect(organizationId: string): Promise<void> {
    if (this.isConnecting) {
      logger.debug('Baileys connection already in progress');
      return;
    }

    this.isConnecting = true;
    this.organizationId = organizationId;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(
        this._getSessionPath(organizationId)
      );

      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        logger: this._createLogger(),
        printQRInTerminal: false, // QR shown via API, not terminal
        auth: state,
        browser: ['NossoCRM', 'Desktop', '1.0'],
        syncFullHistory: false, // Don't sync all history (memory efficient)
        markOnlineOnConnect: true,
        retryRequestDelayMs: 100,
      });

      // =========== Event Listeners ===========

      /**
       * Handle connection updates (QR code, authenticated, disconnected, etc.)
       */
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          // QR code generated - user needs to scan
          logger.info(`QR code generated for org: ${organizationId}`);
          // QR string can be sent to client via API endpoint
          // Store in Redis cache for temporary retrieval
          await this._storeQRCode(organizationId, qr);
        }

        if (connection === 'open') {
          logger.info(`Baileys connected for org: ${organizationId}`);
          this.isConnecting = false;
        }

        if (connection === 'close') {
          this.socket = null;

          if (
            lastDisconnect?.error &&
            (lastDisconnect.error as Boom).output?.statusCode !==
              DisconnectReason.loggedOut
          ) {
            // Reconnect if disconnection was not intentional logout
            logger.info(
              `Reconnecting Baileys for org: ${organizationId} after disconnect`
            );
            setTimeout(() => {
              this.connect(organizationId);
            }, 3000);
          } else {
            logger.info(`Baileys logged out for org: ${organizationId}`);
          }
        }
      });

      /**
       * Handle incoming messages
       */
      sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          if (!msg.message) continue;

          try {
            const payload = this._normalizeInboundMessage(msg);
            if (payload) {
              // Call service layer to process message
              await this._handleInboundMessage(payload);
            }
          } catch (error) {
            logger.error(
              `Error processing message for org ${organizationId}`,
              error
            );
          }
        }
      });

      /**
       * Save authentication credentials whenever they change
       */
      sock.ev.on('creds.update', saveCreds);

      this.socket = sock;
    } catch (error) {
      this.isConnecting = false;
      logger.error(
        `Failed to connect Baileys for org ${organizationId}`,
        error
      );
      throw error;
    }
  }

  /**
   * Disconnect gracefully
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end(new Error('Disconnecting'));
      this.socket = null;
    }
    this.organizationId = null;
  }

  /**
   * Send message to WhatsApp contact
   * @param to_wa_id - Recipient WhatsApp ID (e.g., "5511987654321")
   * @param message - Message content
   * @param organizationId - Organization context
   * @returns Message ID
   */
  async sendMessage(
    to_wa_id: string,
    message: string,
    organizationId: string
  ): Promise<string> {
    if (!this.socket) {
      throw new Error(
        'Baileys socket not connected. Call connect() first.'
      );
    }

    try {
      const messageJid = `${to_wa_id}@s.whatsapp.net`;

      const result = await this.socket.sendMessage(messageJid, {
        text: message,
      });

      logger.info(
        `Message sent to ${to_wa_id} in org ${organizationId}. Message key: ${result.key.id}`
      );

      return result.key.id!;
    } catch (error) {
      logger.error(
        `Failed to send message to ${to_wa_id} in org ${organizationId}`,
        error
      );
      throw error;
    }
  }

  /**
   * Get provider configuration (e.g., for QR code display)
   */
  async getConfig() {
    return {
      qr_code: this.organizationId
        ? await this._getQRCode(this.organizationId)
        : null,
      is_connected: !!this.socket?.user,
      user: this.socket?.user || null,
    };
  }

  // =========== Private Methods ===========

  /**
   * Normalize Baileys message to internal format
   */
  private _normalizeInboundMessage(baileysMsg: any): WhatsAppInboundPayload | null {
    const msg = baileysMsg.message;
    if (!msg) return null;

    let content = '';
    let type: 'text' | 'image' | 'document' | 'audio' | 'video' = 'text';

    // Extract message content based on type
    if (msg.conversation) {
      content = msg.conversation;
    } else if (msg.extendedTextMessage) {
      content = msg.extendedTextMessage.text || '';
    } else if (msg.imageMessage) {
      type = 'image';
      content = msg.imageMessage.caption || '[Image]';
    } else if (msg.documentMessage) {
      type = 'document';
      content = msg.documentMessage.title || '[Document]';
    } else if (msg.audioMessage) {
      type = 'audio';
      content = '[Audio]';
    } else if (msg.videoMessage) {
      type = 'video';
      content = msg.videoMessage.caption || '[Video]';
    } else {
      return null; // Unsupported message type
    }

    const senderJid = baileysMsg.key.remoteJid!;
    const fromWaId = senderJid.split('@')[0];

    return {
      message_id: baileysMsg.key.id!,
      from_wa_id: fromWaId,
      content,
      type,
      media_url: undefined, // Baileys stores media differently
      provider: 'baileys',
      timestamp: new Date(baileysMsg.messageTimestamp * 1000),
      sender_name:
        baileysMsg.pushName || baileysMsg.key.fromMe ? 'Me' : undefined,
    };
  }

  /**
   * Handle inbound message - call service layer
   */
  private async _handleInboundMessage(
    payload: WhatsAppInboundPayload
  ): Promise<void> {
    if (!this.organizationId) {
      logger.error('Organization ID not set when processing inbound message');
      return;
    }

    // Import service dynamically to avoid circular dependencies
    const { whatsappService } = await import('@/lib/whatsapp/service');

    try {
      await whatsappService.receiveMessage(
        payload.from_wa_id,
        payload.content,
        payload.message_id,
        this.organizationId
      );
    } catch (error) {
      logger.error('Error in receiveMessage service call', error);
      throw error;
    }
  }

  /**
   * Get session storage path (per organization)
   */
  private _getSessionPath(organizationId: string): string {
    return `/tmp/whatsapp-sessions/${organizationId}`;
  }

  /**
   * Store QR code temporarily (in-memory or cache)
   */
  private async _storeQRCode(
    organizationId: string,
    qr: string
  ): Promise<void> {
    // TODO: Store in Redis or in-memory cache with TTL
    // For now, just log it
    logger.debug(`QR code for org ${organizationId} ready for display`);
  }

  /**
   * Retrieve QR code for display
   */
  private async _getQRCode(organizationId: string): Promise<string | null> {
    // TODO: Retrieve from Redis or in-memory cache
    return null;
  }

  /**
   * Create Baileys-compatible logger
   */
  private _createLogger() {
    return {
      trace: (msg: string) => logger.debug(msg),
      debug: (msg: string) => logger.debug(msg),
      info: (msg: string) => logger.info(msg),
      warn: (msg: string) => logger.warn(msg),
      error: (msg: string) => logger.error(msg),
    };
  }
}

// =========== Singleton Instance ===========

let instance: BaileysProvider | null = null;

/**
 * Get or create Baileys provider singleton
 */
export function getBaileysProvider(): BaileysProvider {
  if (!instance) {
    instance = new BaileysProvider();
  }
  return instance;
}

/**
 * Export for testing/mocking
 */
export { BaileysProvider };
