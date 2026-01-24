import { describe, it, expect } from 'vitest';
import { normalizeWaId } from '@/lib/whatsapp/service';

/**
 * T014: Test Phone Number Normalization
 *
 * WhatsApp uses E.164 format (international) for wa_id.
 * We need to normalize various input formats to a consistent format:
 * - "5511987654321" → "5511987654321" (already normalized)
 * - "+5511987654321" → "5511987654321" (remove +)
 * - "11987654321" → "5511987654321" (add country code for Brazil)
 * - "11 98765-4321" → "5511987654321" (remove spaces/hyphens, add country code)
 * - "+55 (11) 98765-4321" → "5511987654321" (remove all formatting)
 */

describe('T014: Phone Number Normalization', () => {
  describe('E.164 format (international)', () => {
    it('should keep already-normalized E.164 format', () => {
      expect(normalizeWaId('5511987654321')).toBe('5511987654321');
      expect(normalizeWaId('5521999887766')).toBe('5521999887766');
      expect(normalizeWaId('5585988776655')).toBe('5585988776655');
    });

    it('should remove leading + from international format', () => {
      expect(normalizeWaId('+5511987654321')).toBe('5511987654321');
      expect(normalizeWaId('+5521999887766')).toBe('5521999887766');
    });
  });

  describe('National format (Brazil)', () => {
    it('should add country code 55 to national format', () => {
      expect(normalizeWaId('11987654321')).toBe('5511987654321');
      expect(normalizeWaId('21999887766')).toBe('5521999887766');
      expect(normalizeWaId('85988776655')).toBe('5585988776655');
    });

    it('should handle national format with leading zero (legacy)', () => {
      // Some systems include leading zero: 011987654321
      expect(normalizeWaId('011987654321')).toBe('5511987654321');
      expect(normalizeWaId('021999887766')).toBe('5521999887766');
    });
  });

  describe('Formatting characters', () => {
    it('should remove spaces', () => {
      expect(normalizeWaId('11 98765 4321')).toBe('5511987654321');
      expect(normalizeWaId('+55 11 98765 4321')).toBe('5511987654321');
    });

    it('should remove hyphens', () => {
      expect(normalizeWaId('11-98765-4321')).toBe('5511987654321');
      expect(normalizeWaId('+55-11-98765-4321')).toBe('5511987654321');
    });

    it('should remove parentheses', () => {
      expect(normalizeWaId('(11) 98765-4321')).toBe('5511987654321');
      expect(normalizeWaId('+55 (11) 98765-4321')).toBe('5511987654321');
    });

    it('should handle all common formatting combinations', () => {
      // Common Brazilian formats
      const testCases = [
        ['+55 (11) 98765-4321', '5511987654321'],
        ['55 (11) 98765-4321', '5511987654321'],
        ['(011) 98765-4321', '5511987654321'],
        ['+55 11 98765 4321', '5511987654321'],
        ['11 98765-4321', '5511987654321'],
      ];

      testCases.forEach(([input, expected]) => {
        expect(normalizeWaId(input)).toBe(expected);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle variations of same number', () => {
      const formatted = [
        '5511987654321',
        '+5511987654321',
        '11987654321',
        '011987654321',
        '+55 11 98765-4321',
        '+55 (11) 98765-4321',
        '11 98765-4321',
        '+55 (11) 9 8765-4321', // With space in mobile part
      ];

      // All should normalize to same value
      const normalized = formatted.map(normalizeWaId);
      expect(new Set(normalized).size).toBe(1); // All unique → same normalized
      expect(normalized[0]).toBe('5511987654321');
    });

    it('should throw on invalid phone numbers', () => {
      expect(() => normalizeWaId('')).toThrow();
      expect(() => normalizeWaId('invalid')).toThrow();
      expect(() => normalizeWaId('123')).toThrow(); // Too short
      expect(() => normalizeWaId('1234567890123456789')).toThrow(); // Too long
    });

    it('should validate minimum digit count', () => {
      // Brazilian numbers: at least 10 digits (national) or 11+ (international)
      expect(() => normalizeWaId('119876543')).toThrow(); // 9 digits
      expect(normalizeWaId('11987654321')).toBe('5511987654321'); // 10 digits (national) → valid
      expect(normalizeWaId('5511987654321')).toBe('5511987654321'); // 12 digits (international) → valid
    });

    it('should validate maximum digit count', () => {
      // E.164: max 15 digits
      expect(() => normalizeWaId('551198765432111111')).toThrow(); // 18 digits
      expect(normalizeWaId('5511987654321')).toBe('5511987654321'); // 12 digits → valid
    });
  });

  describe('Consistency', () => {
    it('should normalize idempotently', () => {
      const original = '+55 (11) 98765-4321';
      const first = normalizeWaId(original);
      const second = normalizeWaId(first);
      const third = normalizeWaId(second);

      expect(first).toBe(second);
      expect(second).toBe(third);
      expect(first).toBe('5511987654321');
    });

    it('should normalize same person from different formats to same ID', () => {
      const formats = [
        '+5511987654321',
        '5511987654321',
        '+55 11 98765-4321',
        '11 98765-4321',
        '011 98765-4321',
      ];

      const normalized = formats.map(normalizeWaId);
      
      // All should be identical
      expect(normalized.every((n) => n === normalized[0])).toBe(true);
      expect(normalized[0]).toBe('5511987654321');
    });
  });

  describe('Regional variations', () => {
    it('should handle different Brazilian area codes', () => {
      const testCases = [
        ['11987654321', '5511987654321'], // São Paulo
        ['21999887766', '5521999887766'], // Rio de Janeiro
        ['31988776655', '5531988776655'], // Minas Gerais
        ['85988776655', '5585988776655'], // Ceará
        ['47988776655', '5547988776655'], // Santa Catarina
      ];

      testCases.forEach(([input, expected]) => {
        expect(normalizeWaId(input)).toBe(expected);
      });
    });

    it('should reject non-mobile numbers (landlines)', () => {
      // Landlines: 2-5 (not 6-9)
      // This might be implementation-specific - some systems allow landlines
      // For WhatsApp, typically only mobile (8-9) are valid
      const expectValidMobile = true;

      if (expectValidMobile) {
        expect(() => normalizeWaId('1133334444')).toThrow(); // Landline
        expect(normalizeWaId('11987654321')).toBe('5511987654321'); // Mobile
      }
    });
  });

  describe('Return format', () => {
    it('should return E.164 format (no + sign, no spaces, digits only)', () => {
      const result = normalizeWaId('+55 (11) 98765-4321');

      expect(result).toMatch(/^\d+$/); // Only digits
      expect(result).not.toMatch(/\+/); // No + sign
      expect(result).not.toMatch(/[\s\-()]/); // No spaces, hyphens, parentheses
      expect(result).toBe('5511987654321');
    });

    it('should always return string starting with 55 (Brazil)', () => {
      const inputs = [
        '5511987654321',
        '+5511987654321',
        '11987654321',
        '+55 11 98765-4321',
      ];

      inputs.forEach((input) => {
        expect(normalizeWaId(input)).toMatch(/^55/);
      });
    });
  });
});
