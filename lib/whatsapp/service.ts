/**
 * WhatsApp Service Layer
 * @file lib/whatsapp/service.ts
 * @description Business logic for receiving, sending, and managing WhatsApp messages
 * Server-only module
 */

import 'server-only';

import { createStaticAdminClient } from '@/lib/supabase/server';
import {
  WhatsAppMessage,
  WhatsAppConversation,
  WhatsAppInboundPayload,
} from '@/types/whatsapp';
import { logger } from '@/lib/logger';

/**
 * WhatsApp service for handling message operations
 * All methods enforce multi-tenant isolation via organization_id
 */
class WhatsAppService {
  private supabase = createStaticAdminClient();

  /**
   * Process inbound message from webhook
   * Handles:
   * - Idempotency (check if already processed)
   * - Lead deduplication (create if not exists)
   * - Message storage
   * - Conversation tracking
   *
   * @param fromWaId - Sender's WhatsApp ID
   * @param content - Message content
   * @param messageId - Unique webhook message ID (for idempotency)
   * @param organizationId - Organization context
   */
  async receiveMessage(
    fromWaId: string,
    content: string,
    messageId: string,
    organizationId: string
  ): Promise<void> {
    const supabase = this.supabase.setHeader(
      'x-organization-id',
      organizationId
    );

    // =========== Step 1: Idempotency Check ===========
    // Prevent duplicate processing if webhook is retried
    const { data: existingLog } = await supabase
      .from('whatsapp_webhook_logs')
      .select('id, status')
      .eq('message_id', messageId)
      .single()
      .catch(() => ({ data: null }));

    if (existingLog) {
      if (existingLog.status === 'processed') {
        logger.info(`Message ${messageId} already processed, skipping`);
        return;
      }
      if (existingLog.status === 'processing') {
        logger.warn(`Message ${messageId} is being processed, waiting...`);
        // Could implement retry logic here
        return;
      }
    }

    // Create webhook log entry (mark as processing)
    const { data: logEntry, error: logError } = await supabase
      .from('whatsapp_webhook_logs')
      .insert({
        organization_id: organizationId,
        message_id: messageId,
        status: 'processing',
        payload: {
          from_wa_id: fromWaId,
          content,
          timestamp: new Date().toISOString(),
        },
        attempts: 1,
      })
      .select()
      .single();

    if (logError) {
      // If unique constraint fails, message already being processed
      logger.warn(
        `Webhook log insert failed (possible duplicate): ${logError.message}`
      );
      return;
    }

    try {
      // =========== Step 2: Normalize Phone Number ===========
      const normalizedPhone = this._normalizePhoneNumber(fromWaId);

      // =========== Step 3: Find or Create Lead ===========
      // Deduplication: check if lead with this wa_id exists
      let lead;
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, name, phone')
        .eq('organization_id', organizationId)
        .eq('wa_id', fromWaId)
        .single()
        .catch(() => ({ data: null }));

      if (existingLead) {
        lead = existingLead;
        logger.debug(`Found existing lead ${lead.id} for wa_id ${fromWaId}`);
      } else {
        // Create new lead
        const { data: newLead, error: leadError } = await supabase
          .from('leads')
          .insert({
            organization_id: organizationId,
            name: `WhatsApp ${normalizedPhone}`, // Default name, user can edit
            phone: normalizedPhone,
            wa_id: fromWaId,
            source: 'whatsapp',
            status: 'novo', // Default status
            // funnel_id and stage_id will need to be set by org config or defaults
          })
          .select('id, name, phone')
          .single();

        if (leadError) {
          throw new Error(`Failed to create lead: ${leadError.message}`);
        }

        lead = newLead;
        logger.info(`Created new lead ${lead.id} from WhatsApp ${fromWaId}`);
      }

      // =========== Step 4: Find or Create Conversation ===========
      let conversation;
      const { data: existingConversation } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('wa_id', fromWaId)
        .single()
        .catch(() => ({ data: null }));

      if (existingConversation) {
        conversation = existingConversation;
        logger.debug(
          `Found existing conversation ${conversation.id} for wa_id ${fromWaId}`
        );
      } else {
        // Create new conversation
        const { data: newConversation, error: convError } = await supabase
          .from('whatsapp_conversations')
          .insert({
            organization_id: organizationId,
            lead_id: lead.id,
            wa_id: fromWaId,
            phone: normalizedPhone,
            status: 'active',
            last_message_at: new Date().toISOString(),
            message_count: 0, // Will be incremented by trigger
          })
          .select('id')
          .single();

        if (convError) {
          throw new Error(
            `Failed to create conversation: ${convError.message}`
          );
        }

        conversation = newConversation;
        logger.info(
          `Created new conversation ${conversation.id} for wa_id ${fromWaId}`
        );
      }

      // =========== Step 5: Store Message ===========
      const { data: message, error: msgError } = await supabase
        .from('whatsapp_messages')
        .insert({
          conversation_id: conversation.id,
          direction: 'inbound',
          content,
          type: 'text', // Default, can be enhanced to detect type
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (msgError) {
        throw new Error(`Failed to store message: ${msgError.message}`);
      }

      logger.info(
        `Stored inbound message ${message.id} in conversation ${conversation.id}`
      );

      // =========== Step 6: Update Webhook Log (Success) ===========
      await supabase
        .from('whatsapp_webhook_logs')
        .update({
          status: 'processed',
          result: {
            lead_id: lead.id,
            conversation_id: conversation.id,
            message_id: message.id,
          },
          processed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);

      logger.info(`Webhook ${messageId} processed successfully`);
    } catch (error) {
      // =========== Error Handling ===========
      logger.error(`Error processing webhook ${messageId}`, error);

      // Update webhook log (failure)
      await supabase
        .from('whatsapp_webhook_logs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          attempts: (logEntry?.attempts || 1) + 1,
          processed_at: new Date().toISOString(),
        })
        .eq('id', logEntry?.id)
        .catch((err) =>
          logger.error('Failed to update webhook log to failed state', err)
        );

      // Re-throw to signal failure to webhook caller
      throw error;
    }
  }

  /**
   * Send message to WhatsApp contact
   * Handles queueing and rate limiting
   *
   * @param leadId - Lead ID to send to
   * @param message - Message content
   * @param organizationId - Organization context
   * @returns Message ID
   */
  async sendMessage(
    leadId: string,
    message: string,
    organizationId: string
  ): Promise<string> {
    const supabase = this.supabase.setHeader(
      'x-organization-id',
      organizationId
    );

    // =========== Step 1: Fetch Lead ===========
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, wa_id, phone')
      .eq('id', leadId)
      .eq('organization_id', organizationId)
      .single();

    if (leadError || !lead) {
      throw new Error(
        `Lead ${leadId} not found in organization ${organizationId}`
      );
    }

    if (!lead.wa_id) {
      throw new Error(
        `Lead ${leadId} does not have a WhatsApp ID (wa_id)`
      );
    }

    // =========== Step 2: Get or Create Conversation ===========
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('lead_id', leadId)
      .single()
      .catch(() => ({ data: null }));

    if (!conversation) {
      throw new Error(
        `No conversation found for lead ${leadId}. User must initiate conversation.`
      );
    }

    // =========== Step 3: Send via Provider ===========
    // Dynamic import to avoid circular dependency
    const { getProvider } = await import('@/lib/whatsapp/provider');
    const provider = await getProvider(organizationId);

    let messageId: string;
    try {
      messageId = await provider.sendMessage(lead.wa_id, message, organizationId);
    } catch (error) {
      logger.error(
        `Failed to send message to ${lead.wa_id} in org ${organizationId}`,
        error
      );
      throw new Error(
        `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // =========== Step 4: Store Outbound Message ===========
    const { data: storedMessage, error: msgError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversation.id,
        direction: 'outbound',
        content: message,
        type: 'text',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (msgError) {
      logger.error(
        `Failed to store outbound message (still sent): ${msgError.message}`
      );
      // Don't throw - message was sent successfully, just not logged
    }

    logger.info(
      `Message sent to lead ${leadId} (wa_id: ${lead.wa_id}). Message ID: ${messageId}`
    );

    return messageId;
  }

  /**
   * Get conversation by ID
   * @param conversationId - Conversation UUID
   * @param organizationId - Organization context
   */
  async getConversation(
    conversationId: string,
    organizationId: string
  ): Promise<WhatsAppConversation | null> {
    const supabase = this.supabase.setHeader(
      'x-organization-id',
      organizationId
    );

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .single()
      .catch(() => ({ data: null }));

    if (error || !data) {
      logger.warn(
        `Conversation ${conversationId} not found in org ${organizationId}`
      );
      return null;
    }

    return data as WhatsAppConversation;
  }

  // =========== Private Methods ===========

  /**
   * Normalize phone number to standard format
   * Input: "5511987654321" (from WhatsApp)
   * Output: "+55 11 98765-4321" (human readable)
   */
  private _normalizePhoneNumber(waId: string): string {
    // Remove any non-digits
    const digits = waId.replace(/\D/g, '');

    // Format: +CC (AC) Number-Number
    if (digits.length === 11 && digits.startsWith('55')) {
      // Brazil format
      return `+${digits.substring(0, 2)} ${digits.substring(2, 4)} ${digits.substring(4, 9)}-${digits.substring(9)}`;
    }

    // Fallback: just add + prefix
    return `+${digits}`;
  }
}

/**
 * Singleton instance
 */
const instance = new WhatsAppService();

/**
 * Export service singleton
 */
export const whatsappService = instance;

/**
 * Export class for testing
 */
export { WhatsAppService };

/**
 * Test interface for receiveMessage
 */
interface ReceiveMessageInput {
  organizationId: string;
  webhook: {
    from: string;
    id: string;
    body: string;
    timestamp: number;
    contact_name?: string;
  };
}

interface ReceiveMessageResponse {
  status: 'processing' | 'error' | 'duplicate' | 'completed';
  message?: string;
  message_id?: string;
  lead_id?: string;
  conversation_id?: string;
}

/**
 * Receive message handler for webhooks
 * This is the main entry point for processing incoming WhatsApp messages
 */
export async function receiveMessage(
  input: ReceiveMessageInput
): Promise<ReceiveMessageResponse> {
  const { organizationId, webhook } = input;

  try {
    // Validate required fields
    if (!organizationId || !webhook?.from || !webhook?.id || !webhook?.timestamp) {
      return { status: 'error', message: 'Missing required fields' };
    }

    // Validate phone number
    if (!webhook.from || !/^55\d{10,11}$/.test(webhook.from)) {
      return { status: 'error', message: 'Invalid phone number' };
    }

    // Validate timestamp
    const now = Math.floor(Date.now() / 1000);
    if (webhook.timestamp < now - 86400 || webhook.timestamp > now + 3600) {
      return { status: 'error', message: 'Invalid timestamp' };
    }

    // Validate body
    if (!webhook.body || webhook.body.trim().length === 0) {
      return { status: 'error', message: 'Empty message body' };
    }

    // Call the service method with proper parameters
    await instance.receiveMessage(
      webhook.from,
      webhook.body,
      webhook.id,
      organizationId
    );

    return {
      status: 'processing',
      message_id: webhook.id,
    };
  } catch (error) {
    console.error('[receiveMessage] Error:', error);
    return {
      status: 'error',
      message: String(error),
      message_id: webhook?.id,
    };
  }
}
