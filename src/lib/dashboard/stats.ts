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
  cancellationRateThisMonth: number  // % of lessons this month that were cancelled (0-100)
  atRiskStudents: number      // Active students with no lesson in last 30 days
  newLeadsThisMonth: number   // COUNT(leads) WHERE created_at in current month
}

type LessonStudentRow = {
  lesson_students: { student_id: string }[] | null
}

export async function getDashboardStats(orgId: string, timezone: string): Promise<DashboardStats> {
  const db = createServiceRoleClient()

  const now = DateTime.now().setZone(timezone)
  const monthStart = now.startOf('month').toUTC().toISO()!
  const thirtyDaysAgo = now.minus({ days: 30 }).toUTC().toISO()!

  const [revenueRes, debtRes, allLessonsThisMonthRes, studentsRes, leadsRes, activeStudentsRes] =
    await Promise.all([
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

      // ALL lessons this month (including cancelled) for cancellation rate
      db
        .from('lessons')
        .select('status')
        .eq('organization_id', orgId)
        .gte('start_at', monthStart),

      // Lessons in last 30 days — join to lesson_students to count distinct students
      db
        .from('lessons')
        .select('lesson_students(student_id)')
        .eq('organization_id', orgId)
        .neq('status', 'cancelled')
        .gte('start_at', thirtyDaysAgo),

      // New leads this calendar month
      db
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', monthStart),

      // Active students count
      db
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('is_active', true),
    ])

  const monthlyRevenue = (revenueRes.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)
  const pendingDebt = (debtRes.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)

  const allLessonsThisMonth = allLessonsThisMonthRes.data ?? []
  const lessonsThisMonth = allLessonsThisMonth.filter(l => l.status !== 'cancelled').length
  const cancelledThisMonth = allLessonsThisMonth.filter(l => l.status === 'cancelled').length
  const totalThisMonth = allLessonsThisMonth.length
  const cancellationRateThisMonth =
    totalThisMonth > 0 ? Math.round((cancelledThisMonth / totalThisMonth) * 100) : 0

  const studentsWithRecentLesson = new Set(
    ((studentsRes.data ?? []) as LessonStudentRow[]).flatMap((lesson) =>
      (lesson.lesson_students ?? []).map((lessonStudent) => lessonStudent.student_id)
    )
  )
  const activeStudents = studentsWithRecentLesson.size
  const totalActiveStudents = activeStudentsRes.count ?? 0
  const atRiskStudents = Math.max(0, totalActiveStudents - activeStudents)

  const newLeadsThisMonth = leadsRes.count ?? 0

  return {
    monthlyRevenue,
    pendingDebt,
    lessonsThisMonth,
    activeStudents,
    cancellationRateThisMonth,
    atRiskStudents,
    newLeadsThisMonth,
  }
}
