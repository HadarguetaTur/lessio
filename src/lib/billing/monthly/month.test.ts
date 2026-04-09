import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { getBillingMonthRange, getCurrentBillingMonth } from './month'

describe('billing month helpers', () => {
  it('uses the organization timezone when formatting the current billing month', () => {
    const lateUtc = DateTime.fromISO('2026-04-30T22:30:00.000Z')

    expect(getCurrentBillingMonth('Asia/Jerusalem', lateUtc.setZone('Asia/Jerusalem'))).toBe('2026-05')
    expect(getCurrentBillingMonth('UTC', lateUtc.setZone('UTC'))).toBe('2026-04')
  })

  it('returns UTC month boundaries for the billing month in the org timezone', () => {
    const range = getBillingMonthRange('2026-05', 'Asia/Jerusalem')

    expect(range.monthStartUTC).toBe('2026-04-30T21:00:00.000Z')
    expect(range.monthEndUTC).toBe('2026-05-31T21:00:00.000Z')
  })
})
