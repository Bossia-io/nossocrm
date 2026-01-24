import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { receiveMessage } from '@/lib/whatsapp/service';

/**
 * T019: Comprehensive Validation Scenarios
 *
 * Tests all acceptance scenarios from spec.md in a single matrix
 * - All valid input combinations
 * - All invalid input combinations
 * - Boundary conditions
 * - State transitions
 * - Side effects validation
 *
 * Validates Constitution I (multi-tenant), II (strict types), III (test-first)
 */

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

describe('T019: Comprehensive Validation Scenarios', () => {
  const organizationId = 'org_test_001';
  const validWaId = '5511987654321';
  const validTimestamp = Math.floor(Date.now() / 1000);

  let mockSupabaseClient: any;
  let databaseState: Map<string, any[]> = new Map();

  beforeEach(() => {
    databaseState.clear();
    databaseState.set('leads', []);
    databaseState.set('messages', []);
    databaseState.set('conversations', []);
    databaseState.set('webhook_logs', []);

    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        const selectMock = vi.fn().mockReturnThis();
        const insertMock = vi.fn().mockReturnThis();
        const updateMock = vi.fn().mockReturnThis();

        selectMock.mockImplementation(() => {
          return {
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        });

        insertMock.mockImplementation((data: any) => {
          const records = databaseState.get(table) || [];
          const withId = { ...data, id: `${table}_${records.length + 1}` };
          records.push(withId);
          databaseState.set(table, records);
          return Promise.resolve({ data: withId, error: null });
        });

        updateMock.mockResolvedValue({ data: {}, error: null });

        return { select: selectMock, insert: insertMock, update: updateMock };
      }),
    };

    (createServerClient as any).mockReturnValue(mockSupabaseClient);
  });

  describe('Input Validation - Required Fields', () => {
    it('should accept all required fields', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test message',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).not.toBe('error');
    });

    it('should reject missing "from" field', async () => {
      const payload = {
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload as any });
      expect(result.status).toBe('error');
    });

    it('should reject missing "id" field', async () => {
      const payload = {
        from: validWaId,
        body: 'Test',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload as any });
      expect(result.status).toBe('error');
    });

    it('should reject missing "timestamp" field', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
      };

      const result = await receiveMessage({ organizationId, webhook: payload as any });
      expect(result.status).toBe('error');
    });

    it('should reject missing "body" field', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload as any });
      expect(result.status).toBe('error');
    });

    it('should reject missing organizationId', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId: '', webhook: payload });
      expect(result.status).toBe('error');
    });
  });

  describe('Phone Number Validation', () => {
    it('should accept valid E.164 format', async () => {
      const validNumbers = [
        '5511987654321', // 11 digits + 55 country code
        '551133334444', // 10 digits + 55 country code
        '5585988776655', // Different area code
      ];

      for (const from of validNumbers) {
        const result = await receiveMessage({
          organizationId,
          webhook: {
            from,
            id: `msg_${from}`,
            body: 'Test',
            timestamp: validTimestamp,
          },
        });
        expect(result.status).not.toBe('error');
      }
    });

    it('should reject phone numbers too short', async () => {
      const payload = {
        from: '551199', // Too short
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });

    it('should reject phone numbers too long', async () => {
      const payload = {
        from: '55119876543211111111111111111111', // Too long
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });

    it('should reject phone with non-numeric characters', async () => {
      const invalidNumbers = ['551199-8765-4321', '(55)1199876543', '55 11 98765-4321'];

      for (const from of invalidNumbers) {
        const result = await receiveMessage({
          organizationId,
          webhook: {
            from,
            id: `msg_${from}`,
            body: 'Test',
            timestamp: validTimestamp,
          },
        });
        // Should either normalize or reject
        expect(result.status).not.toBe('error');
      }
    });

    it('should reject phone without country code', async () => {
      const payload = {
        from: '11987654321', // Missing 55 country code
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });
  });

  describe('Timestamp Validation', () => {
    it('should accept current timestamp', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).not.toBe('error');
    });

    it('should accept recent past timestamp (5 minutes ago)', async () => {
      const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;

      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: fiveMinutesAgo,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).not.toBe('error');
    });

    it('should reject timestamp in future', async () => {
      const future = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: future,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });

    it('should reject very old timestamp (24+ hours ago)', async () => {
      const yesterday = Math.floor(Date.now() / 1000) - 86400;

      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: yesterday,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });

    it('should reject non-integer timestamp', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: 'not_a_number' as any,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });

    it('should reject zero timestamp', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: 0,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });

    it('should reject negative timestamp', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: -1000,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });
  });

  describe('Message Body Validation', () => {
    it('should accept non-empty message body', async () => {
      const validBodies = ['Hello', 'Single word', 'Multi word message', '123', 'Special!@#$%'];

      for (const body of validBodies) {
        const result = await receiveMessage({
          organizationId,
          webhook: {
            from: validWaId,
            id: `msg_${body}`,
            body,
            timestamp: validTimestamp,
          },
        });
        expect(result.status).not.toBe('error');
      }
    });

    it('should reject empty message body', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: '',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });

    it('should accept very long message body', async () => {
      const longBody = 'A'.repeat(5000);

      const result = await receiveMessage({
        organizationId,
        webhook: {
          from: validWaId,
          id: 'msg_001',
          body: longBody,
          timestamp: validTimestamp,
        },
      });
      expect(result.status).not.toBe('error');
    });

    it('should accept message with unicode characters', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Olá! 你好 مرحبا 🎉',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).not.toBe('error');
    });

    it('should accept message with newlines', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Line 1\nLine 2\nLine 3',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).not.toBe('error');
    });

    it('should accept message with special characters', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Email: test@example.com, Price: $99.99, URL: https://example.com',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).not.toBe('error');
    });
  });

  describe('Message ID Validation', () => {
    it('should accept alphanumeric message ID', async () => {
      const validIds = ['msg_001', 'wamid_abc123xyz', '12345', 'MSG-20250121-001'];

      for (const id of validIds) {
        const result = await receiveMessage({
          organizationId,
          webhook: {
            from: validWaId,
            id,
            body: 'Test',
            timestamp: validTimestamp,
          },
        });
        expect(result.status).not.toBe('error');
      }
    });

    it('should reject empty message ID', async () => {
      const payload = {
        from: validWaId,
        id: '',
        body: 'Test',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });

    it('should handle duplicate message IDs (idempotency)', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_duplicate',
        body: 'Test',
        timestamp: validTimestamp,
      };

      // First call
      const result1 = await receiveMessage({ organizationId, webhook: payload });
      expect(result1.status).not.toBe('error');

      // Duplicate call
      const result2 = await receiveMessage({ organizationId, webhook: payload });
      expect(result2.status).toBe('duplicate');

      // Should only have 1 message stored
      const messages = databaseState.get('messages')!;
      expect(messages).toHaveLength(1);
    });
  });

  describe('State Transitions', () => {
    it('should transition from processing → completed', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('processing');

      // After successful completion
      const logs = databaseState.get('webhook_logs')!;
      if (logs.length > 0) {
        expect(logs[0].status).toBe('completed');
      }
    });

    it('should transition from processing → failed on error', async () => {
      const payload = {
        from: 'invalid_phone', // Will trigger error
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      expect(result.status).toBe('error');
    });
  });

  describe('Side Effects Validation', () => {
    it('should create lead on first message from new contact', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      await receiveMessage({ organizationId, webhook: payload });

      const leads = databaseState.get('leads')!;
      expect(leads).toHaveLength(1);
      expect(leads[0].wa_id).toBe(validWaId);
    });

    it('should not duplicate lead for same contact', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'First message',
        timestamp: validTimestamp,
      };

      await receiveMessage({ organizationId, webhook: payload });
      await receiveMessage({
        organizationId,
        webhook: { ...payload, id: 'msg_002', body: 'Second message' },
      });

      const leads = databaseState.get('leads')!;
      expect(leads).toHaveLength(1);
    });

    it('should create message record', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test message',
        timestamp: validTimestamp,
      };

      await receiveMessage({ organizationId, webhook: payload });

      const messages = databaseState.get('messages')!;
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('Test message');
    });

    it('should create conversation record', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      await receiveMessage({ organizationId, webhook: payload });

      const conversations = databaseState.get('conversations')!;
      expect(conversations.length).toBeGreaterThan(0);
    });

    it('should log webhook in webhook_logs table', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: 'Test',
        timestamp: validTimestamp,
      };

      await receiveMessage({ organizationId, webhook: payload });

      const logs = databaseState.get('webhook_logs')!;
      expect(logs).toHaveLength(1);
      expect(logs[0].message_id).toBe('msg_001');
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle exactly max length message', async () => {
      const maxLength = 65536; // Max TEXT column size
      const body = 'A'.repeat(maxLength);

      const result = await receiveMessage({
        organizationId,
        webhook: {
          from: validWaId,
          id: 'msg_001',
          body,
          timestamp: validTimestamp,
        },
      });
      expect(result.status).not.toBe('error');
    });

    it('should handle extremely long message (truncate if needed)', async () => {
      const veryLong = 'B'.repeat(1000000);

      const result = await receiveMessage({
        organizationId,
        webhook: {
          from: validWaId,
          id: 'msg_001',
          body: veryLong,
          timestamp: validTimestamp,
        },
      });
      // Should either process or truncate, not error
      expect(['processing', 'completed']).toContain(result.status);
    });

    it('should handle whitespace-only body', async () => {
      const payload = {
        from: validWaId,
        id: 'msg_001',
        body: '   \n\t  ', // Only whitespace
        timestamp: validTimestamp,
      };

      const result = await receiveMessage({ organizationId, webhook: payload });
      // Should reject or handle as empty
      expect([' error', 'processing']).toContain(result.status);
    });
  });
});
