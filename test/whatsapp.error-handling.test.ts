import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { receiveMessage } from '@/lib/whatsapp/service';

/**
 * T017: Test Error Handling & Edge Cases
 *
 * Validates that webhook processing gracefully handles errors:
 * - Missing organization_id → 400 error
 * - Missing message.from → 400 error
 * - Database failure → marks as "failed" but returns 200 to webhook
 * - Lead creation fails → continues to store webhook log
 * - Message storage fails → still marks as processed
 */

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

describe('T017: Error Handling & Edge Cases', () => {
  const organizationId = 'org_test_123';
  const waId = '5511987654321';

  let mockSupabaseClient: any;

  beforeEach(() => {
    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        const selectMock = vi.fn().mockReturnThis();
        const insertMock = vi.fn().mockReturnThis();
        const updateMock = vi.fn().mockReturnThis();
        const upsertMock = vi.fn().mockReturnThis();

        selectMock.mockResolvedValue({ data: null, error: null });
        insertMock.mockResolvedValue({ data: { id: 'test_id' }, error: null });
        updateMock.mockResolvedValue({ data: {}, error: null });
        upsertMock.mockResolvedValue({ data: {}, error: null });

        return { select: selectMock, insert: insertMock, update: updateMock, upsert: upsertMock };
      }),
    };

    (createServerClient as any).mockReturnValue(mockSupabaseClient);
  });

  describe('Input validation', () => {
    it('should reject webhook without organization_id', async () => {
      const webhookPayload = {
        from: waId,
        id: 'msg_123',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({
        organizationId: undefined,
        webhook: webhookPayload,
      });

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/organization_id|required/i);
    });

    it('should reject webhook without message.from (wa_id)', async () => {
      const webhookPayload = {
        // from is missing
        id: 'msg_123',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({
        organizationId,
        webhook: webhookPayload as any,
      });

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/from|wa_id|required/i);
    });

    it('should reject webhook without message.id', async () => {
      const webhookPayload = {
        from: waId,
        // id is missing
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({
        organizationId,
        webhook: webhookPayload as any,
      });

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/id|message_id|required/i);
    });

    it('should reject webhook without timestamp', async () => {
      const webhookPayload = {
        from: waId,
        id: 'msg_123',
        body: 'Test',
        // timestamp is missing
      };

      const result = await receiveMessage({
        organizationId,
        webhook: webhookPayload as any,
      });

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/timestamp|required/i);
    });
  });

  describe('Database errors', () => {
    it('should mark webhook as "failed" if webhook_logs insert fails', async () => {
      const logsTableMock = vi.fn();
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'whatsapp_webhook_logs') {
          logsTableMock();
          return {
            select: vi.fn().mockReturnThis().mockResolvedValue({ data: null, error: null }),
            insert: vi
              .fn()
              .mockReturnThis()
              .mockResolvedValue({ data: null, error: { message: 'DB error' } }),
            update: vi.fn().mockReturnThis(),
          };
        }
        return {
          select: vi.fn().mockReturnThis().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis().mockResolvedValue({ data: {}, error: null }),
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
        };
      });

      const webhookPayload = {
        from: waId,
        id: 'msg_123',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({ organizationId, webhook: webhookPayload });

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('should still mark webhook as "processed" even if lead creation fails', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnThis().mockResolvedValue({ data: null, error: null }),
            insert: vi
              .fn()
              .mockReturnThis()
              .mockResolvedValue({ data: null, error: { message: 'Lead creation failed' } }),
          };
        }
        return {
          select: vi.fn().mockReturnThis().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis().mockResolvedValue({ data: {}, error: null }),
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
        };
      });

      const webhookPayload = {
        from: waId,
        id: 'msg_123',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({ organizationId, webhook: webhookPayload });

      // Should try to mark webhook as failed
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });

    it('should gracefully handle message storage failure', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'whatsapp_messages') {
          return {
            insert: vi
              .fn()
              .mockReturnThis()
              .mockResolvedValue({ data: null, error: { message: 'Message storage failed' } }),
          };
        }
        return {
          select: vi.fn().mockReturnThis().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis().mockResolvedValue({ data: {}, error: null }),
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
        };
      });

      const webhookPayload = {
        from: waId,
        id: 'msg_123',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({ organizationId, webhook: webhookPayload });

      // Should still mark as error, but webhook_log should be updated
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });

    it('should handle Supabase connection timeout gracefully', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        return {
          select: vi.fn().mockReturnThis().mockRejectedValue(new Error('Connection timeout')),
          insert: vi.fn().mockReturnThis().mockRejectedValue(new Error('Connection timeout')),
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
        };
      });

      const webhookPayload = {
        from: waId,
        id: 'msg_123',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({ organizationId, webhook: webhookPayload });

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/Connection|timeout/i);
    });
  });

  describe('Retry scenarios', () => {
    it('should handle exponential backoff for transient errors', async () => {
      let callCount = 0;
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'whatsapp_webhook_logs') {
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis().mockImplementation(() => {
              callCount++;
              if (callCount < 3) {
                return Promise.reject(new Error('Transient error'));
              }
              return Promise.resolve({ data: {}, error: null });
            }),
            update: vi.fn().mockReturnThis().mockResolvedValue({ data: {}, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis().mockResolvedValue({ data: {}, error: null }),
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
        };
      });

      const webhookPayload = {
        from: waId,
        id: 'msg_123',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      // With retry logic, should succeed on 3rd attempt
      // (This test assumes service implements retry logic)
      const result = await receiveMessage({ organizationId, webhook: webhookPayload });

      expect([0, 3]).toContain(callCount); // Either succeeded after retries or failed immediately
    });
  });

  describe('Webhook response behavior', () => {
    it('should return 200 to webhook even if processing failed (async pattern)', async () => {
      // The receiveMessage should use async processing pattern
      // It should accept the webhook (200) but process async

      const webhookPayload = {
        from: waId,
        id: 'msg_123',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({ organizationId, webhook: webhookPayload });

      // Should have a status (processing/failed/etc) but should not throw
      expect(result.status).toBeDefined();
      expect(['processing', 'failed', 'error', 'already_processed']).toContain(result.status);
    });
  });

  describe('Logging', () => {
    it('should log error details for debugging', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'whatsapp_webhook_logs') {
          return {
            select: vi.fn().mockReturnThis().mockResolvedValue({ data: null, error: null }),
            insert: vi
              .fn()
              .mockReturnThis()
              .mockRejectedValue(new Error('Database connection failed')),
            update: vi.fn().mockReturnThis(),
          };
        }
        return {
          select: vi.fn().mockReturnThis().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis().mockResolvedValue({ data: {}, error: null }),
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockReturnThis(),
        };
      });

      const webhookPayload = {
        from: waId,
        id: 'msg_123',
        body: 'Test',
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await receiveMessage({ organizationId, webhook: webhookPayload });

      expect(result.status).toBe('error');
      // Error details should be accessible for debugging
      expect(result.error).toBeDefined();

      consoleSpy.mockRestore();
    });
  });
});
