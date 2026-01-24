/**
 * WhatsApp Integration Types
 * @file types/whatsapp.ts
 * @description TypeScript interfaces for WhatsApp messaging, conversations, and provider abstraction
 */

/**
 * WhatsApp message direction
 * @enum {string}
 */
export type WhatsAppMessageDirection = 'inbound' | 'outbound';

/**
 * WhatsApp message type (text is primary, others for future media support)
 * @enum {string}
 */
export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video';

/**
 * Conversation status
 * @enum {string}
 */
export type WhatsAppConversationStatus = 'active' | 'archived' | 'blocked';

/**
 * Provider type for strategy pattern
 * @enum {string}
 */
export type WhatsAppProviderType = 'baileys' | 'meta';

/**
 * Webhook processing status
 * @enum {string}
 */
export type WhatsAppWebhookStatus = 'processing' | 'processed' | 'failed';

/**
 * Individual message within a conversation
 * @interface WhatsAppMessage
 */
export interface WhatsAppMessage {
  /** Unique message ID (UUID) */
  id: string;

  /** Reference to conversation (UUID) */
  conversation_id: string;

  /** Who sent the message */
  direction: WhatsAppMessageDirection;

  /** Message text content (1-1000 chars) */
  content: string;

  /** Message type (mostly text for MVP) */
  type: WhatsAppMessageType;

  /** Optional media URL (for non-text messages) */
  media_url?: string | null;

  /** Optional media ID from provider (for reference) */
  media_id?: string | null;

  /** Creation timestamp */
  created_at: Date;
}

/**
 * Conversation thread with a WhatsApp contact
 * One row per contact per organization
 * @interface WhatsAppConversation
 */
export interface WhatsAppConversation {
  /** Unique conversation ID (UUID) */
  id: string;

  /** Organization ID for RLS filtering (UUID) */
  organization_id: string;

  /** Associated lead ID (UUID) */
  lead_id: string;

  /** WhatsApp contact ID (e.g., "5511987654321") */
  wa_id: string;

  /** Normalized phone number (e.g., "+55 11 98765-4321") */
  phone: string;

  /** Conversation status */
  status: WhatsAppConversationStatus;

  /** Timestamp of last message in conversation */
  last_message_at?: Date | null;

  /** Count of messages in conversation */
  message_count: number;

  /** Creation timestamp */
  created_at: Date;

  /** Last update timestamp */
  updated_at: Date;

  /** Optional: message history (loaded separately) */
  messages?: WhatsAppMessage[];
}

/**
 * Webhook delivery log entry (audit trail for idempotency)
 * @interface WhatsAppWebhookLog
 */
export interface WhatsAppWebhookLog {
  /** Unique log entry ID (UUID) */
  id: string;

  /** Organization ID (UUID) */
  organization_id: string;

  /** Unique webhook message ID (used for deduplication) */
  message_id: string;

  /** Processing status */
  status: WhatsAppWebhookStatus;

  /** Full webhook payload (JSONB, for replay) */
  payload: Record<string, unknown>;

  /** Result of processing (what was created/updated) */
  result?: Record<string, unknown> | null;

  /** Error message if processing failed */
  error_message?: string | null;

  /** Number of processing attempts */
  attempts: number;

  /** Timestamp when processing completed */
  processed_at?: Date | null;

  /** Creation timestamp */
  created_at: Date;
}

/**
 * Inbound webhook payload from Baileys or Meta
 * Structure varies by provider, but normalized to this interface
 * @interface WhatsAppInboundPayload
 */
export interface WhatsAppInboundPayload {
  /** Message ID from provider (unique per delivery) */
  message_id: string;

  /** Sender's WhatsApp ID */
  from_wa_id: string;

  /** Message content */
  content: string;

  /** Message type (text, image, etc.) */
  type: WhatsAppMessageType;

  /** Optional media URL */
  media_url?: string;

  /** Provider name (baileys | meta) */
  provider: WhatsAppProviderType;

  /** Timestamp of message */
  timestamp: Date;

  /** Optional: sender name (from contact or message) */
  sender_name?: string;
}

/**
 * Send message request (internal API)
 * @interface WhatsAppSendRequest
 */
export interface WhatsAppSendRequest {
  /** Lead ID to send message to */
  lead_id: string;

  /** Message content to send */
  message: string;

  /** Message type (defaults to 'text') */
  type?: WhatsAppMessageType;

  /** Optional media URL (if type !== 'text') */
  media_url?: string;
}

/**
 * Send message response (internal API)
 * @interface WhatsAppSendResponse
 */
export interface WhatsAppSendResponse {
  /** Success flag */
  success: boolean;

  /** Message ID if successful */
  message_id?: string;

  /** Error message if failed */
  error?: string;

  /** HTTP status code */
  status: number;
}

/**
 * Strategy pattern interface for WhatsApp provider abstraction
 * Allows switching between Baileys and Meta without code duplication
 * @interface WhatsAppProvider
 */
export interface WhatsAppProvider {
  /** Provider type identifier */
  type: WhatsAppProviderType;

  /**
   * Initialize provider (connect, load session, etc.)
   * @param organizationId - Organization context
   * @returns Promise that resolves when ready
   */
  connect(organizationId: string): Promise<void>;

  /**
   * Shutdown provider gracefully
   */
  disconnect(): Promise<void>;

  /**
   * Send message to contact
   * @param to_wa_id - WhatsApp contact ID
   * @param message - Message content
   * @param organizationId - Organization context (for multi-tenant isolation)
   * @returns Message ID if successful
   */
  sendMessage(
    to_wa_id: string,
    message: string,
    organizationId: string
  ): Promise<string>;

  /**
   * Receive inbound webhook message
   * Providers will call this internally
   * @param payload - Normalized inbound payload
   * @param organizationId - Organization context
   */
  onMessage?(
    payload: WhatsAppInboundPayload,
    organizationId: string
  ): Promise<void>;

  /**
   * Get provider-specific configuration
   * Used for QR code display, token validation, etc.
   */
  getConfig?(): Promise<Record<string, unknown>>;
}

/**
 * Organization WhatsApp settings
 * Stored in organization_settings table or separate table
 * @interface WhatsAppSettings
 */
export interface WhatsAppSettings {
  /** Organization ID */
  organization_id: string;

  /** Active provider type */
  provider: WhatsAppProviderType;

  /** Provider-specific config (tokens, session, etc.) */
  provider_config: Record<string, unknown>;

  /** Webhook secret for signature verification */
  webhook_secret?: string;

  /** Whether WhatsApp feature is enabled */
  enabled: boolean;

  /** Creation timestamp */
  created_at: Date;

  /** Last update timestamp */
  updated_at: Date;
}

/**
 * Query result type for conversation list
 * @interface WhatsAppConversationListItem
 */
export interface WhatsAppConversationListItem extends WhatsAppConversation {
  /** Lead information (name, email, phone) */
  lead?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };

  /** Last message preview */
  last_message_preview?: string | null;

  /** Unread message count */
  unread_count?: number;
}

/**
 * Pagination metadata for list endpoints
 * @interface PaginationMeta
 */
export interface PaginationMeta {
  /** Current page/offset */
  offset: number;

  /** Page size/limit */
  limit: number;

  /** Total count of items */
  total: number;

  /** Whether more items available */
  hasMore: boolean;
}

/**
 * List response wrapper
 * @interface ListResponse<T>
 */
export interface ListResponse<T> {
  /** Array of items */
  data: T[];

  /** Pagination metadata */
  meta: PaginationMeta;
}

/**
 * Error response (standardized)
 * @interface ErrorResponse
 */
export interface ErrorResponse {
  /** Error code for debugging */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Additional context */
  details?: Record<string, unknown>;

  /** HTTP status code */
  status: number;
}
