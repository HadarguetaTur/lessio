/**
 * "Needs attention" data for the dashboard — names, not just counts.
 *
 * Composes existing queries (read-only reuse, no new SQL where avoidable):
 * - Unlogged lessons: lessons still 'scheduled' after they ended. First,
 *   because nothing auto-completes a lesson and an un-completed lesson never
 *   becomes a charge — this is the one item that silently costs money.
 * - Billing awaiting approval: this month's `student_monthly_billing` rows that
 *   nobody approved, so no payment request can go out.
 * - Debtors: `getDebtorsOverview` (the /billing/debts source of truth)
 * - Overdue homework: `getAssignments` with the status the /homework tab uses
 * - At-risk students: `getStudentsReport` — the ONE definition of at-risk
 *   (active student, 0 non-cancelled lessons in the last 30 days)
 * - New leads: a direct limited query (skipped when the leads feature is off)
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getDebtorsOverview, type DebtorRow } from '@/lib/charges/debtors'
import { getStudentsReport, type StudentRow } from '@/lib/reports/students'
import { getAssignments } from '@/lib/homework'
import { getCurrentBillingMonth } from '@/lib/billing/monthly/month'

export type AttentionDebtor = Pick<
  DebtorRow,
  'parentId' | 'parentName' | 'childrenNames' | 'totalDebt' | 'oldestAgeDays'
>

export type AttentionLead = {
  id: string
  phone: string
  rawMessage: string
  createdAt: string
}

export type AttentionStudent = {
  studentId: string
  studentName: string
  lastLessonAt: string | null
}

export type AttentionLesson = {
  lessonId: string
  studentName: string
  startAt: string
}

export type AttentionBilling = {
  billingId: string
  studentName: string
  amount: number
}

export type AttentionHomework = {
  assignmentId: string
  studentName: string
  title: string
  dueDate: string | null
}

/** A punch card at or under the org's running-low threshold (decision #46). */
export type AttentionPack = {
  packId: string
  name: string
  holderName: string
  remaining: number
}

export type AttentionData = {
  packsRunningOut?: { top: AttentionPack[]; count: number }
  unloggedLessons: { top: AttentionLesson[]; count: number }
  pendingBilling: { top: AttentionBilling[]; count: number; total: number }
  debtors: { top: AttentionDebtor[]; count: number; totalDebt: number }
  overdueHomework: { top: AttentionHomework[]; count: number }
  /** null when the leads feature is disabled for the org's plan. */
  newLeads: { top: AttentionLead[]; count: number } | null
  atRisk: { top: AttentionStudent[]; count: number }
}

/**
 * Most-at-risk first: students who never had a lesson, then by oldest last lesson.
 * Pure — exported for tests.
 */
export function topAtRiskStudents(rows: StudentRow[], limit = 5): AttentionStudent[] {
  return rows
    .filter((row) => row.isAtRisk)
    .sort((a, b) => {
      if (a.lastLessonAt === null && b.lastLessonAt === null) return 0
      if (a.lastLessonAt === null) return -1
      if (b.lastLessonAt === null) return 1
      return a.lastLessonAt.localeCompare(b.lastLessonAt)
    })
    .slice(0, limit)
    .map((row) => ({
      studentId: row.studentId,
      studentName: row.studentName,
      lastLessonAt: row.lastLessonAt,
    }))
}

/** Active, still-valid cards with credit left at or under the threshold. */
async function getPacksRunningOut(orgId: string, limit: number): Promise<{ top: AttentionPack[]; count: number }> {
  const { getCollectionPolicyServiceRole } = await import('@/lib/cancellation-policy/service')
  const policy = await getCollectionPolicyServiceRole(orgId)
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lesson_pack_balances')
    .select('id, name, remaining, valid_until, student_id, billing_student_id')
    .eq('organization_id', orgId)
    .is('cancelled_at', null)
    .not('activated_at', 'is', null)
    .gt('remaining', 0)
    .lte('remaining', policy.packLowBalanceThreshold)
    .order('remaining', { ascending: true })
  if (error) throw new Error(error.message)

  const today = new Date().toISOString().slice(0, 10)
  const rows = ((data ?? []) as Array<{
    id: string
    name: string
    remaining: number
    valid_until: string | null
    student_id: string | null
    billing_student_id: string | null
  }>).filter((row) => !row.valid_until || row.valid_until >= today)

  const top = rows.slice(0, limit)
  const studentIds = [...new Set(top.map((row) => row.student_id ?? row.billing_student_id).filter(Boolean))] as string[]
  const { data: students } = studentIds.length
    ? await db.from('students').select('id, full_name').eq('organization_id', orgId).in('id', studentIds)
    : { data: [] }
  const names = new Map(((students ?? []) as Array<{ id: string; full_name: string }>).map((s) => [s.id, s.full_name]))

  return {
    top: top.map((row) => ({
      packId: row.id,
      name: row.name,
      holderName: names.get((row.student_id ?? row.billing_student_id) as string) ?? '',
      remaining: Number(row.remaining),
    })),
    count: rows.length,
  }
}

export async function getAttentionData(
  orgId: string,
  timezone: string,
  opts: { limit?: number; leadsEnabled?: boolean } = {}
): Promise<AttentionData> {
  const { limit = 5, leadsEnabled = true } = opts
  const db = createServiceRoleClient()
  const nowISO = DateTime.utc().toISO()
  const billingMonth = getCurrentBillingMonth(timezone)

  const [debtorsOverview, studentsReport, leadsRes, unloggedRes, billingRes, homeworkRows, packsRunningOut] =
    await Promise.all([
      getDebtorsOverview(orgId),
      getStudentsReport(orgId, timezone),
      leadsEnabled
        ? db
            .from('leads')
            .select('id, phone, raw_message, created_at', { count: 'exact' })
            .eq('organization_id', orgId)
            .eq('status', 'new')
            .order('created_at', { ascending: false })
            .limit(limit)
        : Promise.resolve(null),
      // Oldest first: the lesson she is most likely to have forgotten.
      db
        .from('lessons')
        .select('id, start_at, lesson_students(students(full_name))', { count: 'exact' })
        .eq('organization_id', orgId)
        .eq('status', 'scheduled')
        .lt('end_at', nowISO)
        .order('start_at', { ascending: true })
        .limit(limit),
      db
        .from('student_monthly_billing')
        .select('id, total_amount, students(full_name)', { count: 'exact' })
        .eq('organization_id', orgId)
        .eq('billing_month', billingMonth)
        .eq('is_approved', false)
        .eq('is_paid', false)
        .gt('total_amount', 0)
        .order('total_amount', { ascending: false })
        .limit(limit),
      getAssignments(orgId, { status: 'overdue' }).catch(() => []),
      getPacksRunningOut(orgId, limit).catch(() => ({ top: [], count: 0 })),
    ])

  type LessonRow = {
    id: string
    start_at: string
    lesson_students: { students: { full_name: string } | null }[] | null
  }
  type BillingRow = {
    id: string
    total_amount: number | string
    students: { full_name: string } | null
  }

  const unloggedRows = (unloggedRes.data ?? []) as unknown as LessonRow[]
  const billingRows = (billingRes.data ?? []) as unknown as BillingRow[]

  return {
    unloggedLessons: {
      top: unloggedRows.map((row) => ({
        lessonId: row.id,
        studentName: row.lesson_students?.[0]?.students?.full_name ?? '',
        startAt: row.start_at,
      })),
      count: unloggedRes.count ?? unloggedRows.length,
    },
    pendingBilling: {
      top: billingRows.map((row) => ({
        billingId: row.id,
        studentName: row.students?.full_name ?? '',
        amount: Number(row.total_amount),
      })),
      count: billingRes.count ?? billingRows.length,
      total: billingRows.reduce((sum, row) => sum + Number(row.total_amount), 0),
    },
    overdueHomework: {
      top: homeworkRows.slice(0, limit).map((row) => ({
        assignmentId: row.id,
        studentName: row.studentName,
        title: row.title,
        dueDate: row.dueDate ?? null,
      })),
      count: homeworkRows.length,
    },
    debtors: {
      // Rows arrive sorted by totalDebt desc; strip the heavy charges[] array.
      top: debtorsOverview.rows.slice(0, limit).map((row) => ({
        parentId: row.parentId,
        parentName: row.parentName,
        childrenNames: row.childrenNames,
        totalDebt: row.totalDebt,
        oldestAgeDays: row.oldestAgeDays,
      })),
      count: debtorsOverview.debtorCount,
      totalDebt: debtorsOverview.totalDebt,
    },
    packsRunningOut,
    newLeads: leadsRes
      ? {
          top: (leadsRes.data ?? []).map((lead) => ({
            id: lead.id,
            phone: lead.phone,
            rawMessage: lead.raw_message ?? '',
            createdAt: lead.created_at,
          })),
          count: leadsRes.count ?? 0,
        }
      : null,
    atRisk: {
      top: topAtRiskStudents(studentsReport.rows, limit),
      count: studentsReport.atRiskCount,
    },
  }
}
