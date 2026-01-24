/**
 * WhatsApp Baileys Client
 * @file lib/whatsapp/client.ts
 * @description WebSocket connection manager for Baileys WhatsApp integration (stub for MVP)
 * Server-only module (uses server-only directive)
 */

import 'server-only';

import {
  WhatsAppProviderType,
  WhatsAppProvider,
} from '@/types/whatsapp';
import { logger } from '@/lib/logger';

/**
 * Baileys provider implementation (stub for MVP)
 * Full implementation requires @whiskeysockets/baileys installation
 */
class BaileysProvider implements WhatsAppProvider {
  readonly type: WhatsAppProviderType = 'baileys';

  async connect(organizationId: string): Promise<void> {
    logger.info(`[Baileys] Connection stub - org: ${organizationId}`);
    logger.warn('[Baileys] Full implementation requires baileys library');
  }

  async disconnect(): Promise<void> {
    logger.info('[Baileys] Disconnect stub');
  }

  async sendMessage(
    toWaId: string,
    message: string,
    organizationId: string
  ): Promise<string> {
    logger.warn('[Baileys] sendMessage stub - not implemented');
    return 'stub_msg_' + Date.now();
  }

  async getConfig() {
    return {
      qr_code: null,
      is_connected: false,
      user: null,
    };
  }
}

/**
 * Get Baileys provider instance
 */
export function getBaileysProvider(): BaileysProvider {
  return new BaileysProvider();
}

/**
 * Export for testing/mocking
 */
export { BaileysProvider };
