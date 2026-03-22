import { describe, it, expect } from 'vitest'
import { normalizePhone, PhoneNormalizationError } from './index'

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

    it('error message includes the offending number', () => {
      expect(() => normalizePhone('bad')).toThrow('bad')
    })
  })
})
