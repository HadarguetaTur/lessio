import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  formatBillingMonthLabel,
  getBillingPeriodDates,
  getBillingMonthRange,
  getBillingMonthSelectOptionValues,
  getCurrentBillingMonth,
} from './month'

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

  it('uses the previous period before a custom cycle start day', () => {
    const now = DateTime.fromISO('2026-09-10T12:00:00', { zone: 'Asia/Jerusalem' })
    expect(getCurrentBillingMonth('Asia/Jerusalem', now, 15)).toBe('2026-08')
    expect(getBillingPeriodDates('2026-08', 'Asia/Jerusalem', 15)).toEqual({
      periodStart: '2026-08-15',
      periodEnd: '2026-09-14',
    })
  })

  it('formats billing month labels with the requested Intl locale', () => {
    expect(formatBillingMonthLabel('2026-04', 'Asia/Jerusalem', 'en-US')).toMatch(/April 2026/)
    expect(formatBillingMonthLabel('2026-04', 'Asia/Jerusalem', 'he-IL')).toContain('אפריל')
  })

  it('includes an out-of-range selected month in select options', () => {
    const opts = getBillingMonthSelectOptionValues('UTC', '2030-01', 2, 2)
    expect(opts).toContain('2030-01')
    expect(opts.length).toBeGreaterThan(4)
  })
})
