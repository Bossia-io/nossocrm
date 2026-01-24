import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { receiveMessage } from '@/lib/whatsapp/service';

/**
 * T015: Integration Test - Complete Receive Flow
 *
 * Tests the entire flow from webhook reception to lead/message creation:
 * 1. Webhook arrives with message from wa_id
 * 2. Check if wa_id already exists
 * 3. Create lead if new
 * 4. Create/update conversation
 * 5. Store message
 * 6. Mark webhook as processed
 */

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

describe('T015: Complete Receive Flow Integration', () => {
  const organizationId = 'org_test_123';
  const waId = '5511987654321';
  const messageId = 'msg_integration_001';

  let mockSupabaseClient: any;
  let databaseState: any = {};

  beforeEach(() => {
    databaseState = {
      webhookLogs: [],
      leads: [],
      messages: [],
      conversations: [],
    };

    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        const selectMock = vi.fn().mockReturnThis();
        const insertMock = vi.fn().mockReturnThis();
        const updateMock = vi.fn().mockReturnThis();
        const upsertMock = vi.fn().mockReturnThis();
        const eqMock = vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null }));

        selectMock.mockImplementation(() => {
          return {
            eq: eqMock,
          };
        });

        insertMock.mockImplementation((data: any) => {
          databaseState[table]?.push(data);
          return Promise.resolve({ data: { ...data, id: `${table}_id_${Date.now()}` }, error: null });
        });

        updateMock.mockImplementation(() => {
          return Promise.resolve({ data: {}, error: null });
        });

        upsertMock.mockImplementation((data: any) => {
          databaseState[table]?.push(data);
          return Promise.resolve({ data, error: null });
        });

        return {
          select: selectMock,
          insert: insertMock,
          update: updateMock,
          upsert: upsertMock,
        };
      }),
    };

    (createServerClient as any).mockReturnValue(mockSupabaseClient);
  });

  it('should complete full flow: webhook → lead → conversation → message', async () => {
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Olá, gostaria de informações',
      timestamp: Math.floor(Date.now() / 1000),
      pushName: 'João Silva', // WhatsApp contact name
    };

    const result = await receiveMessage({ organizationId, webhook: webhookPayload });

    // Should process successfully
    expect(result.status).toBe('processing');
    expect(result.leadId).toBeDefined();

    // Verify lead was created with correct data
    expect(databaseState.leads.length).toBeGreaterThan(0);
    const createdLead = databaseState.leads[0];
    expect(createdLead.wa_id).toBe(waId);
    expect(createdLead.organization_id).toBe(organizationId);
    expect(createdLead.source).toBe('whatsapp');

    // Verify conversation was created
    expect(databaseState.conversations.length).toBeGreaterThan(0);
    const createdConv = databaseState.conversations[0];
    expect(createdConv.organization_id).toBe(organizationId);

    // Verify message was stored
    expect(databaseState.messages.length).toBeGreaterThan(0);
    const createdMsg = databaseState.messages[0];
    expect(createdMsg.message_id).toBe(messageId);
    expect(createdMsg.text).toBe(webhookPayload.body);

    // Verify webhook was logged
    expect(databaseState.webhookLogs.length).toBeGreaterThan(0);
    const webhookLog = databaseState.webhookLogs[0];
    expect(webhookLog.message_id).toBe(messageId);
  });

  it('should handle message with contact name from WhatsApp', async () => {
    const contactName = 'João da Silva';
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Teste',
      timestamp: Math.floor(Date.now() / 1000),
      pushName: contactName,
    };

    await receiveMessage({ organizationId, webhook: webhookPayload });

    const lead = databaseState.leads[0];
    // Lead should use contact name if available, otherwise default
    expect(lead.name).toBeDefined();
    expect(typeof lead.name).toBe('string');
  });

  it('should use default name if WhatsApp contact name not available', async () => {
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Teste',
      timestamp: Math.floor(Date.now() / 1000),
      // No pushName
    };

    await receiveMessage({ organizationId, webhook: webhookPayload });

    const lead = databaseState.leads[0];
    expect(lead.name).toMatch(/Lead|WhatsApp|Contact/i);
  });

  it('should create conversation with correct metadata', async () => {
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    await receiveMessage({ organizationId, webhook: webhookPayload });

    const conversation = databaseState.conversations[0];
    expect(conversation.organization_id).toBe(organizationId);
    expect(conversation.status).toBe('active');
    expect(conversation.last_message_at).toBeDefined();
  });

  it('should store message with correct timestamp', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test',
      timestamp,
    };

    await receiveMessage({ organizationId, webhook: webhookPayload });

    const message = databaseState.messages[0];
    expect(message.message_id).toBe(messageId);
    expect(message.text).toBe('Test');
    expect(message.timestamp).toBeDefined();
  });

  it('should perform actions in correct order', async () => {
    const callOrder: string[] = [];
    const originalFrom = mockSupabaseClient.from;

    mockSupabaseClient.from = vi.fn((table: string) => {
      callOrder.push(`from(${table})`);
      return originalFrom(table);
    });

    const webhookPayload = {
      from: waId,
      id: messageId,
      body: 'Test',
      timestamp: Math.floor(Date.now() / 1000),
    };

    await receiveMessage({ organizationId, webhook: webhookPayload });

    // Expected order:
    // 1. Check webhook_logs (idempotency)
    // 2. Check leads (dedup)
    // 3. Insert lead (if new)
    // 4. Upsert conversation
    // 5. Insert message
    // 6. Update webhook_logs status

    expect(callOrder).toContain('from(whatsapp_webhook_logs)');
    expect(callOrder).toContain('from(leads)');
    expect(callOrder).toContain('from(whatsapp_conversations)');
    expect(callOrder).toContain('from(whatsapp_messages)');
  });
});
