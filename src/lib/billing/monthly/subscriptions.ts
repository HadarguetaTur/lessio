import { DateTime } from 'luxon'
import type { SubscriptionRow, SubscriptionsContribution, MissingFieldsError } from './types'
import { round2 } from './types'

/**
 * The subset of a subscription this check needs. Kept structural so callers
 * outside the monthly engine (the real-time charge path, the billing detail
 * page) can select four columns instead of a whole SubscriptionRow.
 */
export type CoverageSubscription = Pick<
  SubscriptionRow,
  'student_id' | 'start_date' | 'end_date' | 'is_paused'
>

/**
 * Per-lesson check (spec §3.1): does this student have an active subscription
 * covering the given lesson date?
 */
export function checkActiveSubscriptionForLesson(
  studentId: string,
  lessonDate: string, // YYYY-MM-DD in org timezone
  subscriptions: CoverageSubscription[]
): boolean {
  for (const sub of subscriptions) {
    if (sub.student_id !== studentId) continue
    if (sub.is_paused) continue
    if (sub.start_date > lessonDate) continue
    if (sub.end_date && sub.end_date < lessonDate) continue
    return true
  }
  return false
}

/**
 * Per-month check (spec §3.2): does this subscription contribute a monthly
 * fee for the given billing month?
 */
export function isSubscriptionActiveForMonth(
  subscription: SubscriptionRow,
  billingMonth: string, // YYYY-MM
  periodStart?: string,
  periodEnd?: string
): boolean {
  if (subscription.is_paused) return false

  const monthStart = periodStart
    ? DateTime.fromISO(periodStart).startOf('day')
    : DateTime.fromFormat(billingMonth, 'yyyy-MM').startOf('month')
  const monthEnd = periodEnd
    ? DateTime.fromISO(periodEnd).endOf('day')
    : monthStart.endOf('month')

  const startDate = DateTime.fromISO(subscription.start_date)
  const endDate = subscription.end_date
    ? DateTime.fromISO(subscription.end_date)
    : null

  if (startDate > monthEnd) return false
  if (endDate && endDate < monthStart) return false

  return true
}

/**
 * Pro-rata calculation (spec §3.3): when a subscription starts or ends
 * mid-month, charge only for the active days.
 */
export function calculateProRataAmount(
  monthlyAmount: number,
  billingMonth: string, // YYYY-MM
  startDate: string,    // YYYY-MM-DD
  endDate?: string | null,
  periodStart?: string,
  periodEnd?: string
): number {
  if (monthlyAmount <= 0) return 0

  const monthStart = periodStart
    ? DateTime.fromISO(periodStart).startOf('day')
    : DateTime.fromFormat(billingMonth, 'yyyy-MM').startOf('month')
  const monthEnd = periodEnd
    ? DateTime.fromISO(periodEnd).endOf('day')
    : monthStart.endOf('month')
  const daysInMonth = Math.floor(monthEnd.startOf('day').diff(monthStart, 'days').days) + 1

  const subStart = DateTime.fromISO(startDate)
  const subEnd = endDate ? DateTime.fromISO(endDate) : null

  const effectiveStart = subStart > monthStart ? subStart : monthStart
  const effectiveEnd = subEnd && subEnd < monthEnd ? subEnd : monthEnd

  const activeDays = Math.floor(effectiveEnd.diff(effectiveStart, 'days').days) + 1

  if (activeDays >= daysInMonth) return monthlyAmount
  return round2((monthlyAmount * activeDays) / daysInMonth)
}

/**
 * Subscriptions contribution for a billing month (spec §4.3).
 * Returns MissingFieldsError if overlapping active subscriptions are found.
 */
export function calculateSubscriptionsContribution(
  subscriptions: SubscriptionRow[],
  billingMonth: string,
  periodStart?: string,
  periodEnd?: string
): SubscriptionsContribution | MissingFieldsError {
  const active = subscriptions.filter((s) =>
    isSubscriptionActiveForMonth(s, billingMonth, periodStart, periodEnd)
  )

  if (active.length > 1) {
    return {
      MISSING_FIELDS: [
        {
          table: 'subscriptions',
          field: 'end_date',
          why_needed:
            'Two subscriptions are active for the same billing month — end_date must be set on one to resolve the overlap',
          example_values: [
            DateTime.fromFormat(billingMonth, 'yyyy-MM')
              .endOf('month')
              .toISODate()!,
          ],
        },
      ],
    }
  }

  let subscriptionsTotal = 0
  for (const sub of active) {
    subscriptionsTotal += calculateProRataAmount(
      sub.monthly_amount,
      billingMonth,
      sub.start_date,
      sub.end_date,
      periodStart,
      periodEnd
    )
  }

  return {
    subscriptionsTotal: round2(subscriptionsTotal),
    activeSubscriptionsCount: active.length,
  }
}
