/**
 * KPI stats for the dashboard page.
 * Server-only — uses service role client.
 * Per /docs/sprint-9-scope.md § Story 2.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import { OPEN_CHARGE_STATUSES } from '@/lib/charges'
import { getCurrentBillingMonth } from '@/lib/billing/monthly/month'

export type DashboardStats = {
  monthlyRevenue: number      // SUM(charges.amount) WHERE status='paid', paid_at in current calendar month
  pendingDebt: number         // SUM(charges.amount) WHERE status in ('pending', 'invoiced')
  lessonsThisMonth: number    // COUNT(lessons) WHERE start_at in current month, status != 'cancelled'
  activeStudents: number      // COUNT(DISTINCT student_id) with lesson in last 30 days
  cancellationRateThisMonth: number  // % of lessons this month that were cancelled (0-100)
  atRiskStudents: number      // Active students with no lesson in last 30 days
  newLeadsThisMonth: number   // COUNT(leads) WHERE created_at in current month
  monthlyBillingTotal: number // SUM(student_monthly_billing.total_amount) for current billing month
  monthlyBillingPaid: number  // SUM where is_paid=true
  monthlyBillingOpen: number  // SUM where is_paid=false
}

type LessonStudentRow = {
  lesson_students: { student_id: string }[] | null
}

export type Trend = {
  direction: 'up' | 'down' | 'neutral'
  label: string
}

export type DashboardStatsWithDeltas = DashboardStats & {
  deltas: {
    revenue: Trend
    lessons: Trend
    students: Trend
    leads: Trend
  }
  avgRevenuePerStudent: number
  lessonsPerTeacher: number
  leadConversionRate: number
}

function computeTrend(current: number, previous: number): Trend {
  if (previous === 0 && current === 0) return { direction: 'neutral', label: '\u2014' }
  if (previous === 0) return { direction: 'up', label: '+100%' }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { direction: 'neutral', label: '\u2014' }
  if (pct > 0) return { direction: 'up', label: `+${pct}%` }
  return { direction: 'down', label: `${pct}%` }
}

export async function getDashboardStatsWithDeltas(
  orgId: string,
  timezone: string,
  _locale?: string
): Promise<DashboardStatsWithDeltas> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)

  // Current month stats
  const current = await getDashboardStats(orgId, timezone)

  // Previous month boundaries
  const prevMonthStart = now.minus({ months: 1 }).startOf('month').toUTC().toISO()!
  const prevMonthEnd = now.startOf('month').toUTC().toISO()!

  // Previous month queries
  const [prevRevenueRes, prevLessonsRes, prevStudentsRes, prevLeadsRes] = await Promise.all([
    db
      .from('charges')
      .select('amount')
      .eq('organization_id', orgId)
      .eq('status', 'paid')
      .gte('paid_at', prevMonthStart)
      .lt('paid_at', prevMonthEnd),
    db
      .from('lessons')
      .select('status')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .gte('start_at', prevMonthStart)
      .lt('start_at', prevMonthEnd),
    db
      .from('lessons')
      .select('lesson_students(student_id)')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .gte('start_at', prevMonthStart)
      .lt('start_at', prevMonthEnd),
    db
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', prevMonthStart)
      .lt('created_at', prevMonthEnd),
  ])

  const prevRevenue = (prevRevenueRes.data ?? []).reduce((sum, c) => sum + Number(c.amount), 0)
  const prevLessons = (prevLessonsRes.data ?? []).length
  const prevStudents = new Set(
    ((prevStudentsRes.data ?? []) as LessonStudentRow[]).flatMap((lesson) =>
      (lesson.lesson_students ?? []).map((ls) => ls.student_id)
    )
  ).size
  const prevLeads = prevLeadsRes.count ?? 0

  // New KPIs
  // Active teachers count
  const teachersRes = await db
    .from('teachers')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_active', true)

  const activeTeachersCount = teachersRes.count ?? 0

  // Lead conversion rate
  const monthStart = now.startOf('month').toUTC().toISO()!
  const [convertedLeadsRes, totalLeadsRes] = await Promise.all([
    db
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'converted')
      .gte('created_at', monthStart),
    db
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .gte('created_at', monthStart),
  ])

  const convertedLeads = convertedLeadsRes.count ?? 0
  const totalLeads = totalLeadsRes.count ?? 0

  const avgRevenuePerStudent = current.activeStudents > 0
    ? Math.round(current.monthlyRevenue / current.activeStudents)
    : 0
  const lessonsPerTeacher = activeTeachersCount > 0
    ? Math.round((current.lessonsThisMonth / activeTeachersCount) * 10) / 10
    : 0
  const leadConversionRate = totalLeads > 0
    ? Math.round((convertedLeads / totalLeads) * 100)
    : 0

  return {
    ...current,
    deltas: {
      revenue: computeTrend(current.monthlyRevenue, prevRevenue),
      lessons: computeTrend(current.lessonsThisMonth, prevLessons),
      students: computeTrend(current.activeStudents, prevStudents),
      leads: computeTrend(current.newLeadsThisMonth, prevLeads),
    },
    avgRevenuePerStudent,
    lessonsPerTeacher,
    leadConversionRate,
  }
}

export async function getDashboardStats(orgId: string, timezone: string): Promise<DashboardStats> {
  const db = createServiceRoleClient()

  const now = DateTime.now().setZone(timezone)
  const monthStart = now.startOf('month').toUTC().toISO()!
  const thirtyDaysAgo = now.minus({ days: 30 }).toUTC().toISO()!

  const currentBillingMonth = getCurrentBillingMonth(timezone, now)

  const [revenueRes, debtRes, allLessonsThisMonthRes, studentsRes, leadsRes, activeStudentsRes, billingRes] =
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
        .in('status', [...OPEN_CHARGE_STATUSES]),

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

      // Monthly billing totals for current month
      db
        .from('student_monthly_billing')
        .select('total_amount, is_paid')
        .eq('organization_id', orgId)
        .eq('billing_month', currentBillingMonth),
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
    lessonsThisMonth,
    activeStudents,
    cancellationRateThisMonth,
    atRiskStudents,
    newLeadsThisMonth,
    monthlyBillingTotal,
    monthlyBillingPaid,
    monthlyBillingOpen,
  }
}
