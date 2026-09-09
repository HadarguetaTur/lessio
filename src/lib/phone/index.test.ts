import { describe, it, expect } from 'vitest'
import { normalizeInboundPhone, normalizePhone, PhoneNormalizationError } from './index'

describe('normalizePhone', () => {
  describe('valid inputs → E.164', () => {
    it('converts 05X format (10 digits)', () => {
      expect(normalizePhone('0521234567')).toBe('+9725​21234567'.replace('​', ''))
      expect(normalizePhone('0501234567')).toBe('+9725​01234567'.replace('​', ''))
      expect(normalizePhone('0541234567')).toBe('+9725​41234567'.replace('​', ''))
    })

    it('converts 9725X format (12 digits, no plus)', () => {
      expect(normalizePhone('972521234567')).toBe('+972521234567')
      expect(normalizePhone('972501234567')).toBe('+972501234567')
    })

    it('returns +9725X unchanged (already E.164)', () => {
      expect(normalizePhone('+972521234567')).toBe('+972521234567')
      expect(normalizePhone('+972501234567')).toBe('+972501234567')
    })

    it('trims leading/trailing whitespace before normalizing', () => {
      expect(normalizePhone('  0521234567  ')).toBe('+972521234567')
    })

    it('strips dashes and normalizes', () => {
      expect(normalizePhone('052-123-4567')).toBe('+972521234567')
    })

    it('strips parentheses, spaces, and dashes', () => {
      expect(normalizePhone('(054) 693-0333')).toBe('+972546930333')
    })

    it('strips dots', () => {
      expect(normalizePhone('054.693.0333')).toBe('+972546930333')
    })

    it('handles E.164 with spaces', () => {
      expect(normalizePhone('+972 52 123 4567')).toBe('+972521234567')
    })
  })

  describe('invalid inputs → PhoneNormalizationError', () => {
    it('throws for empty string', () => {
      expect(() => normalizePhone('')).toThrow(PhoneNormalizationError)
    })

    it('throws for too-short number', () => {
      expect(() => normalizePhone('052123456')).toThrow(PhoneNormalizationError)
    })

    it('throws for landline (02/03/04 prefix)', () => {
      expect(() => normalizePhone('0212345678')).toThrow(PhoneNormalizationError)
    })

    it('throws for random string', () => {
      expect(() => normalizePhone('not-a-phone')).toThrow(PhoneNormalizationError)
    })

    it('throws for wrong country code', () => {
      expect(() => normalizePhone('+1234567890')).toThrow(PhoneNormalizationError)
    })
  })
})

describe('normalizeInboundPhone', () => {
  it('normalizes Israeli mobiles exactly as normalizePhone does', () => {
    // Parent identity is stored in this shape (parents is unique on
    // organization_id, phone), so it must not move by a single character.
    for (const raw of ['0521234567', '972521234567', '+972521234567', '054-693-0333']) {
      expect(normalizeInboundPhone(raw)).toBe(normalizePhone(raw))
    }
  });

  it('accepts the numbers the webhook used to drop on the floor', () => {
    // A foreign parent, an Israeli landline, a Meta reviewer's US handset.
    expect(normalizeInboundPhone('14155551234')).toBe('+14155551234');
    expect(normalizeInboundPhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalizeInboundPhone('97235551234')).toBe('+97235551234');
  });

  it('still refuses input that is not a number at all', () => {
    expect(() => normalizeInboundPhone('')).toThrow(PhoneNormalizationError);
    expect(() => normalizeInboundPhone('not-a-phone')).toThrow(PhoneNormalizationError);
    expect(() => normalizeInboundPhone('12345')).toThrow(PhoneNormalizationError);
    // '0' is not a country code — accepting a local form would invent a country.
    expect(() => normalizeInboundPhone('035551234')).toThrow(PhoneNormalizationError);
  });
});
