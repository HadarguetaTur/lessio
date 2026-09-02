/**
 * The renewal ladder.
 *
 * `nextRenewalAttemptAt` and `renewalAmountFor` are the two decisions that
 * decide when a customer is charged and how much. They are pure so both can be
 * pinned without a database: the schedule is measured from the period end (not
 * from the failure), so a decline on day 3 does not push the lock-out further
 * out every time, and the price comes from the plan row the subscription holds
 * — a retired row keeps its holders on the price they bought.
 */

import { describe, expect, it } from 'vitest'
import {
  RENEWAL_MAX_ATTEMPTS,
  RENEWAL_RETRY_OFFSETS_DAYS,
  nextRenewalAttemptAt,
  renewalAmountFor,
} from './renewal'
import type { SaasPlanRow } from './plans'

const PERIOD_END = new Date('2026-09-01T00:00:00Z')

function plan(over: Partial<SaasPlanRow> = {}): SaasPlanRow {
  return {
    id: 'plan-solo',
    name: 'solo',
    display_name_he: 'יחיד',
    display_name_en: 'Solo',
    price_monthly: 149,
    price_yearly: 1490,
    features: {
      whatsapp_automation: true,
      ai_assistant: true,
      full_reports: true,
      leads: true,
      homework: true,
      parent_portal: true,
      integrations: true,
      data_retention: true,
    },
    students_quota: null,
    lessons_monthly_quota: null,
    teachers_quota: 1,
    sort_order: 10,
    ...over,
  } as SaasPlanRow
}

describe('nextRenewalAttemptAt', () => {
  it('schedules the retries at day 3 and day 7 after the period end', () => {
    // Attempt 1 just failed -> next is offset[1] = 3 days after period end.
    expect(nextRenewalAttemptAt(PERIOD_END, 1)?.toISOString()).toBe('2026-09-04T00:00:00.000Z')
    // Attempt 2 just failed -> next is offset[2] = 7 days after period end.
    expect(nextRenewalAttemptAt(PERIOD_END, 2)?.toISOString()).toBe('2026-09-08T00:00:00.000Z')
  })

  it('returns null once the budget is spent', () => {
    // After the third failure the account is left to the grace window.
    expect(nextRenewalAttemptAt(PERIOD_END, RENEWAL_MAX_ATTEMPTS)).toBeNull()
  })

  it('measures every attempt from the period end, not from the last failure', () => {
    // Otherwise a slow retry chain would keep postponing the lock-out.
    const attempts = RENEWAL_RETRY_OFFSETS_DAYS.map((_, i) => nextRenewalAttemptAt(PERIOD_END, i))
    expect(attempts[0]?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(attempts[2]?.toISOString()).toBe('2026-09-08T00:00:00.000Z')
  })

  it('spans a week, so the grace window is not consumed by retries alone', () => {
    expect(RENEWAL_RETRY_OFFSETS_DAYS[RENEWAL_RETRY_OFFSETS_DAYS.length - 1]).toBe(7)
  })
})

describe('renewalAmountFor', () => {
  it('charges the monthly price on a monthly interval', () => {
    expect(renewalAmountFor(plan(), 'monthly')).toBe(149)
  })

  it('charges the yearly price on a yearly interval', () => {
    expect(renewalAmountFor(plan(), 'yearly')).toBe(1490)
  })

  it('falls back to the monthly price when a plan has no yearly price', () => {
    expect(renewalAmountFor(plan({ price_yearly: null }), 'yearly')).toBe(149)
  })

  it('renews a grandfathered customer at the retired price', () => {
    // getSaasPlanById deliberately does not filter is_active, so a retired row
    // keeps resolving for the orgs that bought it (see plans.test.ts).
    const legacy = plan({ id: 'plan-advanced', name: 'advanced', price_monthly: 199, sort_order: 15 })
    expect(renewalAmountFor(legacy, 'monthly')).toBe(199)
  })
})
