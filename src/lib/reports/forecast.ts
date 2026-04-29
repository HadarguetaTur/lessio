/**
 * Revenue forecast for the current month.
 * Computes actual paid, projected remaining, and at-risk amounts.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'

export interface MonthForecast {
  actual: number       // already paid this month
  projected: number    // remaining scheduled lessons x avg price + subscriptions
  atRisk: number       // scheduled with at-risk students x avg price
  total: number        // actual + projected
}

export async function getMonthForecast(orgId: string, timezone: string): Promise<MonthForecast> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)
  const monthStart = now.startOf('month').toUTC().toISO()!
  const monthEnd = now.endOf('month').toUTC().toISO()!
  const nowISO = now.toUTC().toISO()!
  const thirtyDaysAgo = now.minus({ days: 30 }).toUTC().toISO()!

  const [
    paidRes,
    scheduledRes,
    avgPriceRes,
    subscriptionsRes,
    cancellationEventsRes,
  ] = await Promise.all([
    // Actual paid this month
    db
      .from('charges')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('status', 'paid')
      .gte('paid_at', monthStart),

    // Remaining scheduled lessons this month
    db
      .from('lessons')
      .select('id, lesson_students(student_id)')
      .eq('organization_id', orgId)
      .eq('status', 'scheduled')
      .gt('start_at', nowISO)
      .lte('start_at', monthEnd),

    // Average lesson price from recent paid charges
    db
      .from('charges')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('status', 'paid')
      .eq('charge_type', 'lesson')
      .gte('paid_at', thirtyDaysAgo),

    // Active subscriptions
    db
      .from('subscriptions')
      .select('monthly_amount')
      .eq('organization_id', orgId)
      .eq('is_active', true),

    // Cancellation events in last 30 days (to find at-risk students)
    db
      .from('cancellation_events')
      .select('student_id')
      .eq('organization_id', orgId)
      .gte('created_at', thirtyDaysAgo),
  ])

  const actual = (paidRes.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)

  // Average lesson price
  const recentCharges = avgPriceRes.data ?? []
  const avgLessonPrice = recentCharges.length > 0
    ? recentCharges.reduce((sum, c) => sum + Number(c.amount), 0) / recentCharges.length
    : 0

  const remainingScheduledCount = (scheduledRes.data ?? []).length

  // Subscription proration for remaining days
  const totalDaysInMonth = now.daysInMonth!
  const remainingDays = totalDaysInMonth - now.day
  const prorationFactor = remainingDays / totalDaysInMonth
  const subscriptionProjected = (subscriptionsRes.data ?? [])
    .reduce((sum, s) => sum + Number(s.monthly_amount), 0) * prorationFactor

  const projected = (remainingScheduledCount * avgLessonPrice) + subscriptionProjected

  // At-risk students: those with 2+ cancellations in last 30 days
  const cancellationCounts = new Map<string, number>()
  for (const event of cancellationEventsRes.data ?? []) {
    const sid = event.student_id as string
    cancellationCounts.set(sid, (cancellationCounts.get(sid) ?? 0) + 1)
  }
  const atRiskStudentIds = new Set(
    [...cancellationCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([id]) => id)
  )

  // Count scheduled lessons that involve at-risk students
  type ScheduledLesson = { id: string; lesson_students: { student_id: string }[] | null }
  let atRiskLessonCount = 0
  for (const lesson of (scheduledRes.data ?? []) as ScheduledLesson[]) {
    const students = lesson.lesson_students ?? []
    if (students.some((ls) => atRiskStudentIds.has(ls.student_id))) {
      atRiskLessonCount++
    }
  }

  const atRisk = atRiskLessonCount * avgLessonPrice

  return {
    actual,
    projected: Math.round(projected),
    atRisk: Math.round(atRisk),
    total: Math.round(actual + projected),
  }
}
