import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'

import { computeSaasMetrics, type SubscriptionRow } from './metrics'

const NOW = DateTime.fromISO('2026-08-20T12:00:00Z', { zone: 'utc' })

function sub(over: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: over.id ?? crypto.randomUUID(),
    organizationId: 'org-1',
    organizationName: 'Org',
    planId: 'plan-advanced',
    planName: 'advanced',
    planLabelHe: 'מתקדם',
    planLabelEn: 'Advanced',
    status: 'active',
    billingInterval: 'monthly',
    monthlyValue: 199,
    trialEndsAt: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    cardLastFour: null,
    // Well before the month under test, so it counts as pre-existing unless
    // a case overrides it.
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('computeSaasMetrics', () => {
  it('sums MRR over paying subscriptions only', () => {
    const m = computeSaasMetrics(
      [
        sub({ status: 'active', monthlyValue: 199 }),
        sub({ status: 'active', monthlyValue: 99 }),
        sub({ status: 'trial', monthlyValue: 199, trialEndsAt: '2026-09-10T00:00:00Z' }),
        sub({ status: 'cancelled', monthlyValue: 199 }),
      ],
      NOW
    )

    expect(m.mrr).toBe(298)
    expect(m.arr).toBe(298 * 12)
    expect(m.payingOrgs).toBe(2)
    expect(m.arpa).toBe(149)
  })

  it('counts past_due in MRR — a failed card is not churn', () => {
    const m = computeSaasMetrics(
      [sub({ status: 'active', monthlyValue: 199 }), sub({ status: 'past_due', monthlyValue: 99 })],
      NOW
    )

    expect(m.mrr).toBe(298)
    expect(m.payingOrgs).toBe(2)
  })

  it('excludes pending_payment and read_only from MRR', () => {
    const m = computeSaasMetrics(
      [
        sub({ status: 'pending_payment', monthlyValue: 199 }),
        sub({ status: 'read_only', monthlyValue: 199 }),
      ],
      NOW
    )

    expect(m.mrr).toBe(0)
    expect(m.payingOrgs).toBe(0)
    expect(m.arpa).toBe(0)
  })

  it('ignores an expired trial when counting active trials', () => {
    const m = computeSaasMetrics(
      [
        sub({ status: 'trial', trialEndsAt: '2026-08-25T00:00:00Z' }), // live
        sub({ status: 'trial', trialEndsAt: '2026-08-10T00:00:00Z' }), // expired
        sub({ status: 'trial', trialEndsAt: null }), // never set
      ],
      NOW
    )

    expect(m.activeTrials).toBe(1)
  })

  it('flags trials ending within seven days', () => {
    const m = computeSaasMetrics(
      [
        sub({ status: 'trial', trialEndsAt: '2026-08-23T00:00:00Z' }), // 3 days out
        sub({ status: 'trial', trialEndsAt: '2026-09-15T00:00:00Z' }), // far out
      ],
      NOW
    )

    expect(m.activeTrials).toBe(2)
    expect(m.trialsEndingWithin7Days).toBe(1)
  })

  it('nets new MRR against churned MRR for the month', () => {
    const m = computeSaasMetrics(
      [
        // Started paying this month.
        sub({ status: 'active', monthlyValue: 199, createdAt: '2026-08-05T00:00:00Z' }),
        // Cancelled this month.
        sub({
          status: 'cancelled',
          monthlyValue: 99,
          cancelledAt: '2026-08-12T00:00:00Z',
        }),
        // Cancelled last month — outside the window.
        sub({
          status: 'cancelled',
          monthlyValue: 500,
          cancelledAt: '2026-07-12T00:00:00Z',
        }),
      ],
      NOW
    )

    expect(m.newMrrThisMonth).toBe(199)
    expect(m.churnedMrrThisMonth).toBe(99)
    expect(m.netNewMrrThisMonth).toBe(100)
    expect(m.cancelledThisMonth).toBe(1)
  })

  it('measures trial conversion only on trials old enough to have decided', () => {
    const m = computeSaasMetrics(
      [
        // Mature cohort: created before this month, within 90 days of its start.
        sub({ status: 'active', createdAt: '2026-06-10T00:00:00Z' }),
        sub({ status: 'cancelled', createdAt: '2026-06-11T00:00:00Z' }),
        // Started this month — too new to judge, must not dilute the rate.
        sub({ status: 'trial', createdAt: '2026-08-18T00:00:00Z', trialEndsAt: '2026-09-18T00:00:00Z' }),
        // Older than the 90-day window.
        sub({ status: 'active', createdAt: '2025-01-01T00:00:00Z' }),
      ],
      NOW
    )

    expect(m.trialConversionSample).toBe(2)
    expect(m.trialConversionRate).toBe(0.5)
  })

  it('reports null rates rather than NaN when there is nothing to divide by', () => {
    const m = computeSaasMetrics([], NOW)

    expect(m.mrr).toBe(0)
    expect(m.arpa).toBe(0)
    expect(m.trialConversionRate).toBeNull()
    expect(m.customerChurnRate).toBeNull()
  })

  it('divides churn by who was paying when the month opened', () => {
    const m = computeSaasMetrics(
      [
        // Three were paying at month start; one of them left.
        sub({ status: 'active', createdAt: '2026-05-01T00:00:00Z' }),
        sub({ status: 'active', createdAt: '2026-05-01T00:00:00Z' }),
        sub({
          status: 'cancelled',
          createdAt: '2026-05-01T00:00:00Z',
          cancelledAt: '2026-08-09T00:00:00Z',
        }),
        // Joined mid-month — not part of the opening balance.
        sub({ status: 'active', createdAt: '2026-08-15T00:00:00Z' }),
      ],
      NOW
    )

    expect(m.customerChurnRate).toBeCloseTo(1 / 3, 10)
  })
})
