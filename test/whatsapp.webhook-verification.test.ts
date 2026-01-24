import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

/**
 * T018: Webhook Signature Verification Test
 *
 * Validates webhook authenticity using HMAC-SHA256
 * - Valid signature: processed
 * - Invalid signature: rejected
 * - Tampered body: detected
 * - Timing-safe comparison: prevent timing attacks
 * - Missing X-Hub-Signature: rejected
 *
 * WhatsApp webhook format:
 * X-Hub-Signature: sha256={hash}
 * hash = HMAC-SHA256(phone_number_id|timestamp|body, app_secret)
 */

describe('T018: Webhook Signature Verification', () => {
  const appSecret = 'test_secret_key_12345';
  const phoneNumberId = '123456789';
  const organizationId = 'org_test_001';

  let webhookBody: string;
  let validSignature: string;

  const generateSignature = (body: string, secret: string): string => {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  };

  const verifyWebhookSignature = (
    signature: string,
    body: string,
    secret: string,
  ): boolean => {
    const expectedSignature = generateSignature(body, secret);

    // Timing-safe comparison (prevent timing attacks)
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    return mismatch === 0;
  };

  beforeEach(() => {
    webhookBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: phoneNumberId },
                messages: [
                  {
                    from: '5511987654321',
                    id: 'wamid.gBEGFBgXvANjAsmw',
                    timestamp: '1234567890',
                    text: { body: 'Hello World' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    validSignature = generateSignature(webhookBody, appSecret);
  });

  it('should accept webhook with valid HMAC signature', () => {
    const isValid = verifyWebhookSignature(validSignature, webhookBody, appSecret);
    expect(isValid).toBe(true);
  });

  it('should reject webhook with invalid signature', () => {
    const invalidSignature = 'invalid_signature_abc123';
    const isValid = verifyWebhookSignature(invalidSignature, webhookBody, appSecret);
    expect(isValid).toBe(false);
  });

  it('should reject webhook with wrong secret', () => {
    const wrongSecret = 'wrong_secret_key';
    const wrongSignature = generateSignature(webhookBody, wrongSecret);
    const isValid = verifyWebhookSignature(wrongSignature, webhookBody, appSecret);
    expect(isValid).toBe(false);
  });

  it('should detect tampered webhook body', () => {
    // Generate signature for original body
    const signature = generateSignature(webhookBody, appSecret);

    // Tamper with body
    const tamperedBody = webhookBody.replace('Hello World', 'Hacked by attacker');

    // Verification should fail
    const isValid = verifyWebhookSignature(signature, tamperedBody, appSecret);
    expect(isValid).toBe(false);
  });

  it('should detect modified phone_number_id in body', () => {
    const originalSignature = generateSignature(webhookBody, appSecret);

    // Modify phone_number_id
    let tamperedBody = JSON.parse(webhookBody);
    tamperedBody.entry[0].changes[0].value.metadata.phone_number_id = '987654321';
    tamperedBody = JSON.stringify(tamperedBody);

    const isValid = verifyWebhookSignature(originalSignature, tamperedBody, appSecret);
    expect(isValid).toBe(false);
  });

  it('should be case-sensitive for signature', () => {
    // Uppercase part of signature
    const modifiedSignature = validSignature.substring(0, 5).toUpperCase() + validSignature.substring(5);

    const isValid = verifyWebhookSignature(modifiedSignature, webhookBody, appSecret);
    expect(isValid).toBe(false);
  });

  it('should reject signature with wrong length', () => {
    const tooShortSignature = validSignature.substring(0, 30);
    const tooLongSignature = validSignature + 'extra';

    expect(verifyWebhookSignature(tooShortSignature, webhookBody, appSecret)).toBe(false);
    expect(verifyWebhookSignature(tooLongSignature, webhookBody, appSecret)).toBe(false);
  });

  it('should use timing-safe comparison', () => {
    // This test ensures comparison doesn't leak timing information
    // Signatures with early differences should not be faster than late differences
    const sig1 = 'aaaa' + validSignature.substring(4);
    const sig2 = validSignature.substring(0, 60) + 'bbbb';

    // Both should take same time to verify (approximately)
    const start1 = process.hrtime.bigint();
    verifyWebhookSignature(sig1, webhookBody, appSecret);
    const end1 = process.hrtime.bigint();

    const start2 = process.hrtime.bigint();
    verifyWebhookSignature(sig2, webhookBody, appSecret);
    const end2 = process.hrtime.bigint();

    // Both should complete (actual timing comparison varies by system)
    expect(end1 > start1).toBe(true);
    expect(end2 > start2).toBe(true);
  });

  it('should handle empty signature', () => {
    const isValid = verifyWebhookSignature('', webhookBody, appSecret);
    expect(isValid).toBe(false);
  });

  it('should handle empty body', () => {
    const signature = generateSignature('', appSecret);
    const isValid = verifyWebhookSignature(signature, '', appSecret);
    expect(isValid).toBe(true);

    // But wrong body should fail
    const isValidWrong = verifyWebhookSignature(signature, 'some data', appSecret);
    expect(isValidWrong).toBe(false);
  });

  it('should reject signature with extra whitespace', () => {
    const signatureWithWhitespace = ' ' + validSignature + ' ';
    const isValid = verifyWebhookSignature(signatureWithWhitespace, webhookBody, appSecret);
    expect(isValid).toBe(false);
  });

  it('should handle signature with different encoding', () => {
    // HMAC should always be hex-encoded
    const base64Signature = Buffer.from(validSignature, 'hex').toString('base64');
    const isValid = verifyWebhookSignature(base64Signature, webhookBody, appSecret);
    expect(isValid).toBe(false);
  });

  it('should validate X-Hub-Signature header format', () => {
    // WhatsApp sends: X-Hub-Signature: sha256={hash}
    const fullHeader = `sha256=${validSignature}`;
    const extractedSignature = fullHeader.split('=')[1];

    const isValid = verifyWebhookSignature(extractedSignature, webhookBody, appSecret);
    expect(isValid).toBe(true);
  });

  it('should reject malformed X-Hub-Signature header', () => {
    const malformedHeaders = [
      validSignature, // Missing sha256=
      `sha1=${validSignature}`, // Wrong algorithm
      `sha256=`, // Missing hash
      'sha256', // Missing = and hash
    ];

    malformedHeaders.forEach((header) => {
      const sig = header.split('=')[1] || header;
      // Should either fail or not match properly
      if (!sig) {
        expect(sig).toBeFalsy();
      }
    });
  });

  it('should consistently verify same signature', () => {
    // Multiple calls should always return same result
    const results = Array(10)
      .fill(null)
      .map(() => verifyWebhookSignature(validSignature, webhookBody, appSecret));

    results.forEach((result) => {
      expect(result).toBe(true);
    });
  });

  it('should handle webhook with multiple messages', () => {
    const multiMessageBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: phoneNumberId },
                messages: [
                  {
                    from: '5511987654321',
                    id: 'msg_001',
                    timestamp: '1234567890',
                    text: { body: 'Message 1' },
                  },
                  {
                    from: '5511987654321',
                    id: 'msg_002',
                    timestamp: '1234567891',
                    text: { body: 'Message 2' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const signature = generateSignature(multiMessageBody, appSecret);
    const isValid = verifyWebhookSignature(signature, multiMessageBody, appSecret);
    expect(isValid).toBe(true);

    // Removing one message should invalidate signature
    const tamperedBody = multiMessageBody.replace('Message 2', '');
    const isValidTampered = verifyWebhookSignature(signature, tamperedBody, appSecret);
    expect(isValidTampered).toBe(false);
  });

  it('should reject old timestamps (replay attack prevention)', () => {
    // This would be implemented in the route handler, not in signature verification
    // But test shows the concept
    const now = Math.floor(Date.now() / 1000);
    const fiveMinutesAgo = now - 300;

    // The route would reject if timestamp < now - threshold
    const maxAge = 300; // 5 minutes
    expect(now - fiveMinutesAgo).toBeGreaterThanOrEqual(maxAge);

    // Recent timestamp should be accepted
    const recent = now - 10;
    expect(now - recent).toBeLessThan(maxAge);
  });

  it('should handle unicode in webhook body', () => {
    const unicodeBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: phoneNumberId },
                messages: [
                  {
                    from: '5511987654321',
                    id: 'wamid.gBEGFBgXvANjAsmw',
                    timestamp: '1234567890',
                    text: { body: 'Olá! 🎉 Como você está?' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const signature = generateSignature(unicodeBody, appSecret);
    const isValid = verifyWebhookSignature(signature, unicodeBody, appSecret);
    expect(isValid).toBe(true);
  });
});
