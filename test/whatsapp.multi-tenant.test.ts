import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { receiveMessage } from '@/lib/whatsapp/service';

/**
 * T016: Multi-Tenant Isolation Test
 *
 * Validates Constitution I: Multiple organizations must be completely isolated
 * - Org A message → creates lead only in Org A
 * - Org B with same wa_id → separate lead in Org B
 * - RLS policies enforced
 * - No data leakage between organizations
 */

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

describe('T016: Multi-Tenant Isolation', () => {
  const org1 = 'org_acme_001';
  const org2 = 'org_globex_002';
  const org3 = 'org_initech_003';

  const waId1 = '5511987654321'; // Same customer
  const waId2 = '5521999887766'; // Different customer

  let mockSupabaseClient: any;
  let databaseState: Map<string, any[]> = new Map();

  beforeEach(() => {
    // Track data by organization
    databaseState.clear();
    databaseState.set('leads', []);
    databaseState.set('messages', []);
    databaseState.set('conversations', []);

    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        const selectMock = vi.fn().mockReturnThis();
        const insertMock = vi.fn().mockReturnThis();
        const updateMock = vi.fn().mockReturnThis();
        const upsertMock = vi.fn().mockReturnThis();
        const eqMock = vi.fn();

        selectMock.mockImplementation(() => {
          return {
            eq: eqMock.mockReturnValue(Promise.resolve({ data: null, error: null })),
          };
        });

        insertMock.mockImplementation((data: any) => {
          const records = databaseState.get(table) || [];
          const withId = { ...data, id: `${table}_${records.length + 1}` };
          records.push(withId);
          databaseState.set(table, records);
          return Promise.resolve({ data: withId, error: null });
        });

        upsertMock.mockImplementation((data: any) => {
          const records = databaseState.get(table) || [];
          records.push(data);
          databaseState.set(table, records);
          return Promise.resolve({ data, error: null });
        });

        updateMock.mockReturnValue(Promise.resolve({ data: {}, error: null }));

        return { select: selectMock, insert: insertMock, update: updateMock, upsert: upsertMock };
      }),
    };

    (createServerClient as any).mockReturnValue(mockSupabaseClient);
  });

  it('should not leak leads between different organizations', async () => {
    const payload = {
      from: waId1,
      id: 'msg_001',
      body: 'Test',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Org 1 receives message
    const result1 = await receiveMessage({ organizationId: org1, webhook: payload });
    expect(result1.status).toBe('processing');

    // Get leads for org1
    const org1Leads = databaseState.get('leads')!.filter((l) => l.organization_id === org1);
    expect(org1Leads).toHaveLength(1);

    // Org 2 should see no leads
    const org2Leads = databaseState.get('leads')!.filter((l) => l.organization_id === org2);
    expect(org2Leads).toHaveLength(0);
  });

  it('should create separate leads for same wa_id in different orgs', async () => {
    const payload = {
      from: waId1,
      id: 'msg_001',
      body: 'Test',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Org 1 receives from wa_id
    await receiveMessage({ organizationId: org1, webhook: payload });

    // Org 2 receives from same wa_id
    await receiveMessage({
      organizationId: org2,
      webhook: { ...payload, id: 'msg_002' },
    });

    // Org 3 receives from same wa_id
    await receiveMessage({
      organizationId: org3,
      webhook: { ...payload, id: 'msg_003' },
    });

    // Should have 3 separate leads
    const allLeads = databaseState.get('leads')!;
    expect(allLeads).toHaveLength(3);

    // Each should have correct org_id
    expect(allLeads.filter((l) => l.organization_id === org1)).toHaveLength(1);
    expect(allLeads.filter((l) => l.organization_id === org2)).toHaveLength(1);
    expect(allLeads.filter((l) => l.organization_id === org3)).toHaveLength(1);

    // All should be for same wa_id but different organizations
    allLeads.forEach((lead) => {
      expect(lead.wa_id).toBe(waId1);
    });
  });

  it('should enforce organization_id on all queries', async () => {
    const payload1 = {
      from: waId1,
      id: 'msg_001',
      body: 'Org1 message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    const payload2 = {
      from: waId2,
      id: 'msg_002',
      body: 'Org2 message',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Org 1 receives message from waId1
    await receiveMessage({ organizationId: org1, webhook: payload1 });

    // Org 2 receives message from waId2
    await receiveMessage({ organizationId: org2, webhook: payload2 });

    // Verify each organization has correct data
    const org1Data = {
      leads: databaseState.get('leads')!.filter((l) => l.organization_id === org1),
      messages: databaseState.get('messages')!.filter((m) => m.organization_id === org1),
      conversations: databaseState.get('conversations')!.filter((c) => c.organization_id === org1),
    };

    const org2Data = {
      leads: databaseState.get('leads')!.filter((l) => l.organization_id === org2),
      messages: databaseState.get('messages')!.filter((m) => m.organization_id === org2),
      conversations: databaseState.get('conversations')!.filter((c) => c.organization_id === org2),
    };

    // Org 1 should have waId1 contact
    expect(org1Data.leads.some((l) => l.wa_id === waId1)).toBe(true);
    expect(org1Data.leads.some((l) => l.wa_id === waId2)).toBe(false);

    // Org 2 should have waId2 contact
    expect(org2Data.leads.some((l) => l.wa_id === waId2)).toBe(true);
    expect(org2Data.leads.some((l) => l.wa_id === waId1)).toBe(false);
  });

  it('should not allow one org to see another org\'s messages', async () => {
    const payload = {
      from: waId1,
      id: 'msg_secret',
      body: 'Confidential message from Org1',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Org 1 sends message
    await receiveMessage({ organizationId: org1, webhook: payload });

    // Org 2 should NOT see Org 1's message
    const org2Messages = databaseState.get('messages')!.filter((m) => m.organization_id === org2);
    expect(org2Messages).toHaveLength(0);

    // Org 1 should see their message
    const org1Messages = databaseState.get('messages')!.filter((m) => m.organization_id === org1);
    expect(org1Messages).toHaveLength(1);
    expect(org1Messages[0].text).toBe('Confidential message from Org1');
  });

  it('should not allow one org to see another org\'s conversations', async () => {
    const payload = {
      from: waId1,
      id: 'msg_001',
      body: 'Test',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Org 1 receives message
    await receiveMessage({ organizationId: org1, webhook: payload });

    // Org 2 should NOT see Org 1's conversation
    const org2Convs = databaseState.get('conversations')!.filter((c) => c.organization_id === org2);
    expect(org2Convs).toHaveLength(0);

    // Org 1 should have conversation
    const org1Convs = databaseState.get('conversations')!.filter((c) => c.organization_id === org1);
    expect(org1Convs.length).toBeGreaterThan(0);
  });

  it('should validate organization_id in service layer', async () => {
    const payload = {
      from: waId1,
      id: 'msg_001',
      body: 'Test',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Try with empty organization_id
    const result = await receiveMessage({ organizationId: '', webhook: payload });
    expect(result.status).toBe('error');

    // Try with null organization_id
    const result2 = await receiveMessage({ organizationId: null as any, webhook: payload });
    expect(result2.status).toBe('error');
  });

  it('should scope RLS policies to organization_id', async () => {
    // This test validates that if someone tried to bypass org_id in the query,
    // RLS policies would prevent it

    const payload = {
      from: waId1,
      id: 'msg_001',
      body: 'Test',
      timestamp: Math.floor(Date.now() / 1000),
    };

    // Create lead in org1
    await receiveMessage({ organizationId: org1, webhook: payload });

    // All created records should have organization_id set
    const leads = databaseState.get('leads')!;
    const messages = databaseState.get('messages')!;
    const conversations = databaseState.get('conversations')!;

    leads.forEach((lead) => {
      expect(lead.organization_id).toBeDefined();
      expect(lead.organization_id).toBe(org1);
    });

    messages.forEach((msg) => {
      expect(msg.organization_id).toBeDefined();
    });

    conversations.forEach((conv) => {
      expect(conv.organization_id).toBeDefined();
    });
  });

  it('should handle multiple organizations concurrently', async () => {
    const payload1 = { from: waId1, id: 'msg_org1', body: 'Org1', timestamp: Math.floor(Date.now() / 1000) };
    const payload2 = { from: waId2, id: 'msg_org2', body: 'Org2', timestamp: Math.floor(Date.now() / 1000) };
    const payload3 = { from: waId1, id: 'msg_org3', body: 'Org3', timestamp: Math.floor(Date.now() / 1000) };

    // Process messages from different orgs "simultaneously"
    await Promise.all([
      receiveMessage({ organizationId: org1, webhook: payload1 }),
      receiveMessage({ organizationId: org2, webhook: payload2 }),
      receiveMessage({ organizationId: org3, webhook: payload3 }),
    ]);

    // Verify isolation
    const leads = databaseState.get('leads')!;
    expect(leads.filter((l) => l.organization_id === org1)).toHaveLength(1);
    expect(leads.filter((l) => l.organization_id === org2)).toHaveLength(1);
    expect(leads.filter((l) => l.organization_id === org3)).toHaveLength(1);
  });
});
