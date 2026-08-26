import { describe, expect, it } from 'vitest'
import { resolveChargeDueDate, DEFAULT_DUE_DAYS, MONTHLY_DUE_DAY } from './chargeDueDate'

const TZ = 'Asia/Jerusalem'

describe('resolveChargeDueDate — monthly', () => {
  it('falls due on the 10th of the month after the one being billed', () => {
    expect(
      resolveChargeDueDate({
        chargeType: 'monthly',
        issuedAt: '2026-04-03T08:00:00.000Z',
        billingMonth: '2026-03',
        timezone: TZ,
      })
    ).toBe(`2026-04-${String(MONTHLY_DUE_DAY).padStart(2, '0')}`)
  })

  it('rolls into the next year across December', () => {
    expect(
      resolveChargeDueDate({
        chargeType: 'monthly',
        issuedAt: '2027-01-02T08:00:00.000Z',
        billingMonth: '2026-12',
        timezone: TZ,
      })
    ).toBe('2027-01-10')
  })

  /**
   * syncMonthlyCharge recomputes and re-upserts the same charge every time the
   * month is regenerated. If the due date moved with `issuedAt`, an
   * already-overdue March bill would quietly reset its deadline on every
   * recalculation and never age.
   */
  it('is stable no matter when the month is recalculated', () => {
    const forMonth = (issuedAt: string) =>
      resolveChargeDueDate({ chargeType: 'monthly', issuedAt, billingMonth: '2026-03', timezone: TZ })

    expect(forMonth('2026-04-01T00:00:00.000Z')).toBe(forMonth('2026-09-30T23:00:00.000Z'))
  })

  it('falls back to net terms when the billing month is missing or malformed', () => {
    const noMonth = resolveChargeDueDate({
      chargeType: 'monthly',
      issuedAt: '2026-03-01T08:00:00.000Z',
      billingMonth: null,
      timezone: TZ,
    })
    expect(noMonth).toBe('2026-03-15')

    const bad = resolveChargeDueDate({
      chargeType: 'monthly',
      issuedAt: '2026-03-01T08:00:00.000Z',
      billingMonth: 'March',
      timezone: TZ,
    })
    expect(bad).toBe('2026-03-15')
  })
})

describe('resolveChargeDueDate — one-off charges', () => {
  it('gives net terms from the day the charge was raised', () => {
    expect(
      resolveChargeDueDate({
        chargeType: 'lesson',
        issuedAt: '2026-08-27T09:00:00.000Z',
        timezone: TZ,
      })
    ).toBe('2026-09-10')
    expect(DEFAULT_DUE_DAYS).toBe(14)
  })

  /**
   * due_date is a calendar date. 23:00 in Israel is 20:00 UTC in summer, so a
   * UTC-based conversion is fine here — but 01:00 Israel time is the previous
   * day in UTC, and that is the case that used to land a day early.
   */
  it('uses the org timezone, not UTC, to decide which day it is', () => {
    // 2026-08-28T01:30 Israel time = 2026-08-27T22:30Z.
    expect(
      resolveChargeDueDate({
        chargeType: 'cancellation',
        issuedAt: '2026-08-27T22:30:00.000Z',
        timezone: TZ,
      })
    ).toBe('2026-09-11')

    // The same instant read in UTC is still the 27th, hence a day earlier.
    expect(
      resolveChargeDueDate({
        chargeType: 'cancellation',
        issuedAt: '2026-08-27T22:30:00.000Z',
        timezone: 'UTC',
      })
    ).toBe('2026-09-10')
  })

  it('crosses month and year ends', () => {
    expect(
      resolveChargeDueDate({ chargeType: 'manual', issuedAt: '2026-12-28T10:00:00.000Z', timezone: TZ })
    ).toBe('2027-01-11')
  })
})
