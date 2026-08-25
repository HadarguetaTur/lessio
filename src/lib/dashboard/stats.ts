/**
 * KPI summary for the dashboard's business strip.
 * Server-only — uses service role client.
 *
 * Semantics (fixed as part of the operational-first redesign):
 * - Money figures are month-to-date: [monthStart, now).
 * - Lesson workload is the full calendar month: [monthStart, nextMonthStart).
 * - Cancellation rate only counts lessons that have already started —
 *   future scheduled lessons no longer dilute the denominator.
 * - Deltas compare month-to-date against the SAME elapsed window last month,
 *   so a mid-month comparison is apples-to-apples.
 * - "At-risk students" no longer lives here: the old value subtracted two
 *   different definitions of "active". The single definition is
 *   `getStudentsReport().isAtRisk`, surfaced with names via
 *   `src/lib/dashboard/attention.ts`.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import { OPEN_CHARGE_STATUSES, sumRemaining } from '@/lib/charges'
import { getCurrentBillingMonth } from '@/lib/billing/monthly/month'

export type Trend = {
  direction: 'up' | 'down' | 'neutral'
  label: string
}

export type CancellationStats = {
  /** 0-100, out of lessons that have already started. */
  rate: number
  cancelled: number
  /** Lessons (any status) whose start_at has passed. */
  elapsed: number
}

export type DashboardSummary = {
  /** SUM(charge_payments.amount) received month-to-date. */
  monthlyRevenue: number
  /** SUM(charges.amount - amount_paid) over open charges — all-time, labeled as such in the UI. */
  pendingDebt: number
  /** Distinct parents with a non-zero remaining balance. */
  debtorCount: number
  /** Non-cancelled lessons in the full calendar month (workload view, includes upcoming). */
  lessonsThisMonth: number
  cancellation: CancellationStats
  /** student_monthly_billing totals for the current billing month. */
  monthlyBillingTotal: number
  monthlyBillingPaid: number
  monthlyBillingOpen: number
  deltas: {
    revenue: Trend
    lessons: Trend
  }
}

export function computeTrend(current: number, previous: number): Trend {
  if (previous === 0 && current === 0) return { direction: 'neutral', label: '—' }
  if (previous === 0) return { direction: 'up', label: '+100%' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { direction: 'neutral', label: '—' }
  if (pct > 0) return { direction: 'up', label: `+${pct}%` }
  return { direction: 'down', label: `${pct}%` }
}

export function sumAmounts(rows: Array<{ amount: number | string }> | null | undefined): number {
  return (rows ?? []).reduce((sum, row) => sum + Number(row.amount), 0)
}

/**
 * Cancellation rate over lessons that have already started.
 * ISO-8601 UTC strings compare correctly as plain strings.
 */
export function computeCancellationRate(
  lessons: Array<{ status: string; start_at: string }>,
  nowISO: string
): CancellationStats {
  const past = lessons.filter((l) => l.start_at <= nowISO)
  const cancelled = past.filter((l) => l.status === 'cancelled').length
  const elapsed = past.length
  const rate = elapsed > 0 ? Math.round((cancelled / elapsed) * 100) : 0
  return { rate, cancelled, elapsed }
}

export async function getDashboardSummary(orgId: string, timezone: string): Promise<DashboardSummary> {
  const db = createServiceRoleClient()

  const now = DateTime.now().setZone(timezone)
  const nowISO = now.toUTC().toISO()!
  const monthStart = now.startOf('month').toUTC().toISO()!
  const nextMonthStart = now.startOf('month').plus({ months: 1 }).toUTC().toISO()!
  // Same elapsed window, one month back — for apples-to-apples deltas.
  const prevMonthStart = now.minus({ months: 1 }).startOf('month').toUTC().toISO()!
  const prevNowISO = now.minus({ months: 1 }).toUTC().toISO()!

  const currentBillingMonth = getCurrentBillingMonth(timezone, now)

  const [revenueRes, prevRevenueRes, debtRes, lessonsRes, prevLessonsRes, billingRes] =
    await Promise.all([
      // Money received month-to-date. Read from charge_payments so a partial
      // payment counts in the month it arrived, not when the charge closes.
      db
        .from('charge_payments')
        .select('amount')
        .eq('organization_id', orgId)
        .gte('paid_at', monthStart)
        .lt('paid_at', nowISO),

      // Same window last month, for the revenue delta.
      db
        .from('charge_payments')
        .select('amount')
        .eq('organization_id', orgId)
        .gte('paid_at', prevMonthStart)
        .lt('paid_at', prevNowISO),

      // All open charges (all-time debt) — net of partial payments. parent_id
      // rides along so the "who owes it" count comes from this query rather
      // than a second pass over the debtors overview.
      db
        .from('charges')
        .select('amount, amount_paid, parent_id')
        .eq('organization_id', orgId)
        .in('status', [...OPEN_CHARGE_STATUSES]),

      // ALL lessons this calendar month (including cancelled) — feeds both the
      // workload count and the elapsed-only cancellation rate.
      db
        .from('lessons')
        .select('status, start_at')
        .eq('organization_id', orgId)
        .gte('start_at', monthStart)
        .lt('start_at', nextMonthStart),

      // Elapsed non-cancelled lessons in the same window last month, for the delta.
      db
        .from('lessons')
        .select('status')
        .eq('organization_id', orgId)
        .neq('status', 'cancelled')
        .gte('start_at', prevMonthStart)
        .lt('start_at', prevNowISO),

      // Monthly billing totals for the current billing month.
      db
        .from('student_monthly_billing')
        .select('total_amount, is_paid')
        .eq('organization_id', orgId)
        .eq('billing_month', currentBillingMonth),
    ])

  const monthlyRevenue = sumAmounts(revenueRes.data)
  const prevRevenue = sumAmounts(prevRevenueRes.data)
  const openCharges = debtRes.data ?? []
  const pendingDebt = sumRemaining(openCharges)
  const debtorCount = new Set(
    openCharges
      .filter((c) => Number(c.amount) - Number(c.amount_paid ?? 0) > 0)
      .map((c) => c.parent_id)
      .filter(Boolean)
  ).size

  const monthLessons = lessonsRes.data ?? []
  const lessonsThisMonth = monthLessons.filter((l) => l.status !== 'cancelled').length
  const cancellation = computeCancellationRate(monthLessons, nowISO)
  // Delta compares what actually happened so far vs the same point last month.
  const elapsedLessonsMtd = monthLessons.filter(
    (l) => l.status !== 'cancelled' && l.start_at <= nowISO
  ).length
  const prevElapsedLessons = (prevLessonsRes.data ?? []).length

  const billingRows = billingRes.data ?? []
  const monthlyBillingTotal = billingRows.reduce((sum, r) => sum + Number(r.total_amount), 0)
  const monthlyBillingPaid = billingRows
    .filter((r) => r.is_paid)
    .reduce((sum, r) => sum + Number(r.total_amount), 0)
  const monthlyBillingOpen = billingRows
    .filter((r) => !r.is_paid)
    .reduce((sum, r) => sum + Number(r.total_amount), 0)

  return {
    monthlyRevenue,
    pendingDebt,
    debtorCount,
    lessonsThisMonth,
    cancellation,
    monthlyBillingTotal,
    monthlyBillingPaid,
    monthlyBillingOpen,
    deltas: {
      revenue: computeTrend(monthlyRevenue, prevRevenue),
      lessons: computeTrend(elapsedLessonsMtd, prevElapsedLessons),
    },
  }
}
