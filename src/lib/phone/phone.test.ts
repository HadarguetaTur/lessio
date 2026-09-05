import { describe, it, expect } from 'vitest'
import { maskPhone, normalizePhone, toIsraeliLocalPhone, PhoneNormalizationError } from './index'

describe('normalizePhone', () => {
  describe('valid inputs', () => {
    it('converts 05XXXXXXXX to +9725XXXXXXXX', () => {
      expect(normalizePhone('0501234567')).toBe('+972501234567')
      expect(normalizePhone('0549876543')).toBe('+972549876543')
    })

    it('converts 9725XXXXXXXX to +9725XXXXXXXX', () => {
      expect(normalizePhone('972501234567')).toBe('+972501234567')
      expect(normalizePhone('972549876543')).toBe('+972549876543')
    })

    it('leaves +9725XXXXXXXX unchanged', () => {
      expect(normalizePhone('+972501234567')).toBe('+972501234567')
      expect(normalizePhone('+972549876543')).toBe('+972549876543')
    })

    it('trims surrounding whitespace', () => {
      expect(normalizePhone('  0501234567  ')).toBe('+972501234567')
      expect(normalizePhone(' +972501234567 ')).toBe('+972501234567')
    })
  })

  describe('invalid inputs', () => {
    it('throws PhoneNormalizationError for an unrecognized format', () => {
      expect(() => normalizePhone('1234567890')).toThrow(PhoneNormalizationError)
      expect(() => normalizePhone('+1234567890')).toThrow(PhoneNormalizationError)
      expect(() => normalizePhone('hello')).toThrow(PhoneNormalizationError)
      expect(() => normalizePhone('')).toThrow(PhoneNormalizationError)
    })

    it('throws for Israeli numbers with wrong local prefix', () => {
      // 02/03/04 area codes — not mobile, not in normalization rules
      expect(() => normalizePhone('021234567')).toThrow(PhoneNormalizationError)
    })

    it('throws for numbers that are too short or too long', () => {
      expect(() => normalizePhone('050123456')).toThrow(PhoneNormalizationError)   // 9 digits
      expect(() => normalizePhone('05012345678')).toThrow(PhoneNormalizationError) // 11 digits
    })

    it('keeps the offending number out of the error message', () => {
      // This error is routinely logged inside an `{ err }` payload, so echoing
      // the input would put subscriber phone numbers in the platform logs.
      // The length still distinguishes an empty field from a malformed one.
      expect(() => normalizePhone('021234567')).toThrow(/9 characters/)
      expect(() => normalizePhone('021234567')).not.toThrow(/021234567/)
    })
  })
})

describe('maskPhone', () => {
  it('keeps the country code, prefix and last four digits', () => {
    expect(maskPhone('+972501234567')).toBe('+9725••••4567')
  })

  it('reveals no more for an unexpected shape than for a canonical one', () => {
    // Unnormalized or foreign input must not fall through to a rawer form.
    expect(maskPhone('050-123-4567')).toBe('••••4567')
    expect(maskPhone('+14155550123')).toBe('••••0123')
  })

  it('never throws, so callers are not tempted back to the raw value', () => {
    expect(maskPhone(null)).toBe('(none)')
    expect(maskPhone(undefined)).toBe('(none)')
    expect(maskPhone('')).toBe('(none)')
    expect(maskPhone('12')).toBe('••••')
  })
})

describe('toIsraeliLocalPhone', () => {
  it('converts E.164 to the local 05 form', () => {
    expect(toIsraeliLocalPhone('+972501234567')).toBe('0501234567')
  })

  it('accepts any shape normalizePhone accepts', () => {
    expect(toIsraeliLocalPhone('050-123-4567')).toBe('0501234567')
    expect(toIsraeliLocalPhone('972501234567')).toBe('0501234567')
  })

  it('returns null for a number that is not an Israeli mobile', () => {
    expect(toIsraeliLocalPhone('+14155550000')).toBeNull()
    expect(toIsraeliLocalPhone('not a phone')).toBeNull()
  })

  it('returns null for missing input', () => {
    expect(toIsraeliLocalPhone(null)).toBeNull()
    expect(toIsraeliLocalPhone(undefined)).toBeNull()
    expect(toIsraeliLocalPhone('')).toBeNull()
  })
})
