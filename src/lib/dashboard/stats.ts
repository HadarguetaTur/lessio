/**
 * KPI stats for the dashboard page.
 * Server-only — uses service role client.
 * Per /docs/sprint-9-scope.md § Story 2.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'

export type DashboardStats = {
  monthlyRevenue: number      // SUM(charges.amount) WHERE status='paid', paid_at in current calendar month
  pendingDebt: number         // SUM(charges.amount) WHERE status='pending'
  lessonsThisMonth: number    // COUNT(lessons) WHERE start_at in current month, status != 'cancelled'
  activeStudents: number      // COUNT(DISTINCT student_id) with lesson in last 30 days
}

export async function getDashboardStats(orgId: string, timezone: string): Promise<DashboardStats> {
  const db = createServiceRoleClient()

  const now = DateTime.now().setZone(timezone)
  const monthStart = now.startOf('month').toUTC().toISO()!
  const thirtyDaysAgo = now.minus({ days: 30 }).toUTC().toISO()!

  const [revenueRes, debtRes, lessonsRes, studentsRes] = await Promise.all([
    // Paid charges this calendar month
    db
      .from('charges')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('status', 'paid')
      .gte('paid_at', monthStart),

    // All pending charges (open debt)
    db
      .from('charges')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('status', 'pending'),

    // Non-cancelled lessons this month
    db
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .gte('start_at', monthStart),

    // Lessons in last 30 days — join to lesson_students to count distinct students
    db
      .from('lessons')
      .select('lesson_students(student_id)')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .gte('start_at', thirtyDaysAgo),
  ])

  const monthlyRevenue = (revenueRes.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)
  const pendingDebt = (debtRes.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)
  const lessonsThisMonth = lessonsRes.count ?? 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeStudents = new Set(
    (studentsRes.data ?? []).flatMap((l: any) =>
      (l.lesson_students ?? []).map((ls: { student_id: string }) => ls.student_id)
    )
  ).size

  return { monthlyRevenue, pendingDebt, lessonsThisMonth, activeStudents }
}
