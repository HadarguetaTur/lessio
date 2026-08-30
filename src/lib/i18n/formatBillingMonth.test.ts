import { describe, it, expect } from 'vitest'
import { formatBillingMonth } from './formatBillingMonth'

describe('formatBillingMonth', () => {
  it('names the month in Hebrew', () => {
    expect(formatBillingMonth('2026-08', 'he')).toBe('אוגוסט 2026')
  })

  it('names the month in English', () => {
    expect(formatBillingMonth('2026-08', 'en')).toBe('August 2026')
  })

  it('handles a single-digit month', () => {
    expect(formatBillingMonth('2026-01', 'en')).toBe('January 2026')
  })

  // A parent is waiting on a payment link; a bad month must not throw.
  it('returns the input unchanged when it is not yyyy-MM', () => {
    expect(formatBillingMonth('not-a-month', 'he')).toBe('not-a-month')
    expect(formatBillingMonth('', 'he')).toBe('')
  })
})
