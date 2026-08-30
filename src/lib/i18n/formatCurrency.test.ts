import { describe, it, expect } from 'vitest'
import { formatCurrency, formatMoney } from './formatCurrency'

/** Intl inserts bidi marks around ₪ in Hebrew; compare on the digits instead. */
function digits(s: string): string {
  return s.replace(/[^\d.,]/g, '')
}

describe('formatCurrency', () => {
  it('defaults to whole shekels', () => {
    expect(digits(formatCurrency(4400, 'he'))).toBe('4,400')
  })

  it('keeps two digits when asked', () => {
    expect(digits(formatCurrency(120, 'he', 2))).toBe('120.00')
  })

  it('groups thousands in both locales', () => {
    expect(digits(formatCurrency(17180, 'en', 2))).toBe('17,180.00')
    expect(digits(formatCurrency(17180, 'he', 2))).toBe('17,180.00')
  })
})

describe('formatMoney', () => {
  it('drops the .00 on whole shekels', () => {
    expect(digits(formatMoney(660, 'he'))).toBe('660')
    expect(digits(formatMoney(0, 'he'))).toBe('0')
  })

  it('keeps agorot when they carry value', () => {
    expect(digits(formatMoney(660.5, 'he'))).toBe('660.50')
  })

  it('groups thousands', () => {
    expect(digits(formatMoney(17180, 'he'))).toBe('17,180')
  })
})
