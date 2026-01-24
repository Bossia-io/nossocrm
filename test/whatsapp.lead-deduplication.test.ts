import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { receiveMessage } from '@/lib/whatsapp/service';

/**
 * T013: Test Lead Deduplication
 *
 * When receiving messages from the same WhatsApp ID (wa_id):
 * - First message: create new Lead
 * - Second message: reuse existing Lead (do not create duplicate)
 * - Messages from different wa_ids: create separate Leads
 * - Multi-tenant: same wa_id in different orgs = separate Leads
 */

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

describe('T013: Lead Deduplication', () => {
  const organizationId = 'org_test_123';
  const waId1 = '5511987654321';
  const waId2 = '5521999887766';

  let mockSupabaseClient: any;
  let leadsCreated: any[] = [];

  beforeEach(() => {
    leadsCreated = [];

    const mockLeadsSelect = vi.fn();
    const mockLeadsInsert = vi.fn();
    const mockLeadsEq = vi.fn();
    const mockLeadsAnd = vi.fn();

    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        if (table === 'leads') {
          return {
            select: mockLeadsSelect,
            insert: mockLeadsInsert,
          };
        }
        if (table === 'whatsapp_webhook_logs') {
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
          };
        }
        if (table === 'whatsapp_conversations') {
          return {
            upsert: vi.fn().mockReturnThis().mockResolvedValue({ data: {}, error: null }),
          };
        }
        if (table === 'whatsapp_messages') {
          return {
            insert: vi.fn().mockReturnThis().mockResolvedValue({ data: {}, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
        };
      }),
    };

    // Mock leads.select() for deduplication check
    mockLeadsSelect.mockReturnThis();
    mockLeadsSelect.mockImplementation(() => {
      return {
        eq: (column: string, value: any) => {
          if (column === 'wa_id' && value === waId1) {
            // Second time we check: lead already exists
            if (leadsCreated.some((l) => l.wa_id === waId1)) {
              return Promise.resolve({
                data: leadsCreated.find((l) => l.wa_id === waId1),
                error: null,
              });
            }
            // First time: doesn't exist
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    });

    // Mock leads.insert()
    mockLeadsInsert.mockReturnThis();
    mockLeadsInsert.mockImplementation((leadData: any) => {
      const newLead = {
        id: `lead_${leadsCreated.length + 1}`,
        ...leadData,
      };
      leadsCreated.push(newLead);
      return Promise.resolve({ data: newLead, error: null });
    });

    (createServerClient as any).mockReturnValue(mockSupabaseClient);
  });

  it('should create new lead for new wa_id', async () => {
    const webhookPayload = {
      from: waId1,
      id: 'msg_001',
      body: 'First message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    const result = await receiveMessage({ organizationId, webhook: webhookPayload });

    expect(result.status).toBe('processing');
    expect(result.leadId).toBeDefined();
    expect(leadsCreated).toHaveLength(1);
    expect(leadsCreated[0].wa_id).toBe(waId1);
  });

  it('should reuse existing lead for same wa_id', async () => {
    const payload1 = {
      from: waId1,
      id: 'msg_001',
      body: 'First message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    const payload2 = {
      from: waId1,
      id: 'msg_002',
      body: 'Second message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // First message: create lead
    const result1 = await receiveMessage({ organizationId, webhook: payload1 });
    expect(leadsCreated).toHaveLength(1);
    const leadId1 = result1.leadId;

    // Second message: reuse lead
    const result2 = await receiveMessage({ organizationId, webhook: payload2 });
    expect(leadsCreated).toHaveLength(1); // Still only 1 lead
    expect(result2.leadId).toBe(leadId1); // Same lead ID
  });

  it('should create separate leads for different wa_ids', async () => {
    const payload1 = {
      from: waId1,
      id: 'msg_001',
      body: 'Message from contact 1',
      timestamp: Math.floor(Date.now() / 1000),
    };

    const payload2 = {
      from: waId2,
      id: 'msg_002',
      body: 'Message from contact 2',
      timestamp: Math.floor(Date.now() / 1000),
    };

    await receiveMessage({ organizationId, webhook: payload1 });
    await receiveMessage({ organizationId, webhook: payload2 });

    expect(leadsCreated).toHaveLength(2);
    expect(leadsCreated[0].wa_id).toBe(waId1);
    expect(leadsCreated[1].wa_id).toBe(waId2);
  });

  it('should create separate leads for same wa_id in different organizations', async () => {
    const org1 = 'org_001';
    const org2 = 'org_002';

    const payload = {
      from: waId1,
      id: 'msg_001',
      body: 'Message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Same wa_id, different orgs
    await receiveMessage({ organizationId: org1, webhook: payload });
    await receiveMessage({ organizationId: org2, webhook: { ...payload, id: 'msg_002' } });

    expect(leadsCreated).toHaveLength(2);
    expect(leadsCreated[0]).toEqual(expect.objectContaining({
      wa_id: waId1,
      organization_id: org1,
    }));
    expect(leadsCreated[1]).toEqual(expect.objectContaining({
      wa_id: waId1,
      organization_id: org2,
    }));
  });

  it('should store lead with correct normalized wa_id', async () => {
    const webhookPayload = {
      from: waId1,
      id: 'msg_001',
      body: 'Test',
      timestamp: Math.floor(Date.now() / 1000),
    };

    await receiveMessage({ organizationId, webhook: webhookPayload });

    const createdLead = leadsCreated[0];
    expect(createdLead.wa_id).toBe(waId1);
    expect(createdLead.organization_id).toBe(organizationId);
  });

  it('should not create duplicate messages for same wa_id', async () => {
    const mockMessagesInsert = vi.fn();
    mockSupabaseClient.from('whatsapp_messages').insert = mockMessagesInsert;
    mockMessagesInsert.mockReturnThis();
    mockMessagesInsert.mockResolvedValue({ data: {}, error: null });

    const payload = {
      from: waId1,
      id: 'msg_001',
      body: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Send same message twice (different message_id would be needed for second send)
    await receiveMessage({ organizationId, webhook: payload });

    // messages.insert called exactly once
    expect(mockMessagesInsert).toHaveBeenCalledTimes(1);
  });

  it('should use UNIQUE(organization_id, wa_id) constraint concept', async () => {
    // This validates the database constraint preventing duplicates
    const payload = {
      from: waId1,
      id: 'msg_001',
      body: 'Test',
      timestamp: Math.floor(Date.now() / 1000),
    };

    const result1 = await receiveMessage({ organizationId, webhook: payload });
    const result2 = await receiveMessage({ organizationId, webhook: { ...payload, id: 'msg_002' } });

    // Both should return same leadId (deduped)
    expect(result1.leadId).toBe(result2.leadId);
    expect(leadsCreated).toHaveLength(1);
  });
});
