/**
 * "Needs attention" data for the dashboard — names, not just counts.
 *
 * Composes existing queries (read-only reuse, no new SQL where avoidable):
 * - Debtors: `getDebtorsOverview` (the /billing/debts source of truth)
 * - At-risk students: `getStudentsReport` — the ONE definition of at-risk
 *   (active student, 0 non-cancelled lessons in the last 30 days)
 * - New leads: a direct limited query (skipped when the leads feature is off)
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getDebtorsOverview, type DebtorRow } from '@/lib/charges/debtors'
import { getStudentsReport, type StudentRow } from '@/lib/reports/students'

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

export type AttentionData = {
  debtors: { top: AttentionDebtor[]; count: number; totalDebt: number }
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

export async function getAttentionData(
  orgId: string,
  timezone: string,
  opts: { limit?: number; leadsEnabled?: boolean } = {}
): Promise<AttentionData> {
  const { limit = 5, leadsEnabled = true } = opts

  const [debtorsOverview, studentsReport, leadsRes] = await Promise.all([
    getDebtorsOverview(orgId),
    getStudentsReport(orgId, timezone),
    leadsEnabled
      ? createServiceRoleClient()
          .from('leads')
          .select('id, phone, raw_message, created_at', { count: 'exact' })
          .eq('organization_id', orgId)
          .eq('status', 'new')
          .order('created_at', { ascending: false })
          .limit(limit)
      : Promise.resolve(null),
  ])

  return {
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
