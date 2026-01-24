import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { receiveMessage } from '@/lib/whatsapp/service';

/**
 * T012: Test Webhook Idempotency
 *
 * When the same webhook is delivered twice (with same message_id),
 * the system should process it only once, preventing duplicate leads/messages.
 *
 * This validates Constitution I (multi-tenant) and the idempotency requirement.
 */

// Mock Supabase client
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

describe('T012: Webhook Idempotency', () => {
  const organizationId = 'org_test_123';
  const messageId = 'msg_unique_identifier_001';
  const waId = '5511987654321';

  let mockSupabaseClient: any;

  beforeEach(() => {
    // Mock webhook logs table
    const mockWebhookLogsSelect = vi.fn();
    const mockWebhookLogsInsert = vi.fn();
    const mockWebhookLogsUpdate = vi.fn();

    // Mock leads table
    const mockLeadsSelect = vi.fn();
    const mockLeadsInsert = vi.fn();

    // Mock messages table
    const mockMessagesSelect = vi.fn();
    const mockMessagesInsert = vi.fn();

    // Mock conversations table
    const mockConversationsSelect = vi.fn();
    const mockConversationsInsert = vi.fn();
    const mockConversationsUpsert = vi.fn();

    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        switch (table) {
          case 'whatsapp_webhook_logs':
            return {
              select: mockWebhookLogsSelect,
              insert: mockWebhookLogsInsert,
              update: mockWebhookLogsUpdate,
            };
          case 'leads':
            return {
              select: mockLeadsSelect,
              insert: mockLeadsInsert,
            };
          case 'whatsapp_messages':
            return {
              select: mockMessagesSelect,
              insert: mockMessagesInsert,
            };
          case 'whatsapp_conversations':
            return {
              select: mockConversationsSelect,
              insert: mockConversationsInsert,
              upsert: mockConversationsUpsert,
            };
          default:
            throw new Error(`Unexpected table: ${table}`);
        }
      }),
    };

    // Setup default mock responses
    mockWebhookLogsSelect.mockReturnThis();
    mockWebhookLogsSelect.mockResolvedValueOnce({ data: null, error: null }); // First call: not found
    mockWebhookLogsSelect.mockResolvedValueOnce({ // Second call: already exists
      data: [
        {
          id: 'log_123',
          message_id: messageId,
          status: 'processed',
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    });

    mockWebhookLogsInsert.mockReturnThis();
    mockWebhookLogsInsert.mockResolvedValue({
      data: { id: 'log_123', message_id: messageId, status: 'processing' },
      error: null,
    });

    mockWebhookLogsUpdate.mockReturnThis();
    mockWebhookLogsUpdate.mockResolvedValue({
      data: { id: 'log_123', status: 'processed' },
      error: null,
    });

    mockLeadsSelect.mockReturnThis();
    mockLeadsSelect.mockResolvedValue({
      data: null,
      error: null,
    });

    mockLeadsInsert.mockReturnThis();
    mockLeadsInsert.mockResolvedValue({
      data: {
        id: 'lead_123',
        name: `Lead WhatsApp +55 11 98765-4321`,
        phone: waId,
        source: 'whatsapp',
        organization_id: organizationId,
      },
      error: null,
    });

    mockMessagesInsert.mockReturnThis();
    mockMessagesInsert.mockResolvedValue({
      data: {
        id: 'msg_db_123',
        message_id: messageId,
        text: 'Test message',
      },
      error: null,
    });

    mockConversationsUpsert.mockReturnThis();
    mockConversationsUpsert.mockResolvedValue({
      data: { id: 'conv_123' },
      error: null,
    });

    (createServerClient as any).mockReturnValue(mockSupabaseClient);
  });

  it('should mark first webhook delivery as "processing"', async () => {
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    const result = await receiveMessage({
      organizationId,
      webhook: webhookPayload,
    });

    expect(result.status).toBe('processing');
    expect(mockSupabaseClient.from).toHaveBeenCalledWith('whatsapp_webhook_logs');
  });

  it('should NOT process duplicate webhook (same message_id)', async () => {
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // First call processes it
    const result1 = await receiveMessage({
      organizationId,
      webhook: webhookPayload,
    });
    expect(result1.status).toBe('processing');

    // Second call with same message_id should be skipped
    const result2 = await receiveMessage({
      organizationId,
      webhook: webhookPayload,
    });

    // Should return early without processing
    expect(result2.status).toBe('already_processed');
    expect(result2.leadId).toBeUndefined(); // No new lead created
  });

  it('should create lead only once despite duplicate webhooks', async () => {
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Call twice with same message_id
    await receiveMessage({ organizationId, webhook: webhookPayload });
    await receiveMessage({ organizationId, webhook: webhookPayload });

    // leads.insert should be called only once
    const leadsTable = mockSupabaseClient.from('leads');
    expect(leadsTable.insert).toHaveBeenCalledTimes(1);
  });

  it('should store message only once despite duplicate webhooks', async () => {
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Call twice with same message_id
    await receiveMessage({ organizationId, webhook: webhookPayload });
    await receiveMessage({ organizationId, webhook: webhookPayload });

    // messages.insert should be called only once
    const messagesTable = mockSupabaseClient.from('whatsapp_messages');
    expect(messagesTable.insert).toHaveBeenCalledTimes(1);
  });

  it('should update webhook log status to "processed" on success', async () => {
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    await receiveMessage({ organizationId, webhook: webhookPayload });

    // Should update the webhook log record
    const logsTable = mockSupabaseClient.from('whatsapp_webhook_logs');
    expect(logsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'processed',
      })
    );
  });

  it('should mark webhook log as "failed" if lead creation fails', async () => {
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Mock lead creation failure
    mockSupabaseClient.from('leads').insert.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database error' },
    });

    const result = await receiveMessage({ organizationId, webhook: webhookPayload });

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
  });

  it('should respect organization_id isolation (Constitution I)', async () => {
    const anotherOrgId = 'org_different_456';

    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Process for org_test_123
    await receiveMessage({ organizationId, webhook: webhookPayload });

    // Process for org_different_456 with same wa_id (should create separate lead)
    await receiveMessage({
      organizationId: anotherOrgId,
      webhook: { ...webhookPayload, id: 'msg_unique_002' }, // Different message_id
    });

    // leads.insert should be called twice (once per org)
    const leadsTable = mockSupabaseClient.from('leads');
    expect(leadsTable.insert).toHaveBeenCalledTimes(2);

    // Each should have correct organization_id
    const calls = leadsTable.insert.mock.calls;
    expect(calls[0][0]).toEqual(expect.objectContaining({ organization_id: organizationId }));
    expect(calls[1][0]).toEqual(expect.objectContaining({ organization_id: anotherOrgId }));
  });
});
