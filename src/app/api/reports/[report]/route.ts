/**
 * CSV export endpoint for all reports.
 * GET /api/reports/[report]?months=N
 *
 * Requires active session (owner or admin).
 * Returns a UTF-8 CSV with BOM for correct Excel display of Hebrew.
 * Per /docs/sprint-17-scope.md § Story 8.
 */

import { NextRequest, NextResponse } from 'next/server'
import { DateTime } from 'luxon'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth/session'
import { canViewEconomics } from '@/lib/auth/roles'
import { requireFeature } from '@/lib/saas/featureGate'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { getOrgTimezone } from '@/lib/organizations'
import { getRevenueReport } from '@/lib/reports/revenue'
import { getLessonsReport } from '@/lib/reports/lessons'
import { getDebtReport } from '@/lib/reports/debt'
import { getTeachersReport } from '@/lib/reports/teachers'
import { getStudentsReport } from '@/lib/reports/students'
import { getOwnerTeacherEconomicsReport } from '@/lib/teacher-economics/report'
import { parseReportMonths } from '@/lib/reports/params'

const BOM = '\uFEFF'

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  return (
    BOM +
    [headers, ...rows]
      .map(row => row.map(escape).join(','))
      .join('\n')
  )
}

interface Context {
  params: Promise<{ report: string }>
}

export async function GET(request: NextRequest, { params }: Context) {
  const session = await getSession()
  const { report } = await params
  const economics = report === 'economics' || report === 'economics-lines'
  if (economics ? !canViewEconomics(session.role) : !['owner', 'admin'].includes(session.role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  if (report !== 'revenue') {
    await requireFeature(session.orgId, 'full_reports')
  }
  const { searchParams } = request.nextUrl
  const orgId = session.orgId
  const timezone = await getOrgTimezone(orgId)
  const cookieStore = await cookies()
  const appLocale = parseAppLocale(cookieStore.get('locale')?.value)

  let csv: string
  let filename: string

  // The export is downloaded by whoever clicked it, so the headers follow the
  // locale already resolved for this request.
  const tc = await getT('reports.csv', appLocale)

  try {
    switch (report) {
      case 'revenue': {
        const months = parseReportMonths(searchParams.get('months'), {
          defaultValue: 12,
          maxValue: 24,
        })
        const { buckets } = await getRevenueReport(orgId, timezone, months, appLocale)
        csv = toCsv(
          [tc('month'), tc('revenuePaid'), tc('monthlyBilling'), tc('monthlyBillingPaid'), tc('monthlyBillingOpen')],
          buckets.map(b => [
            b.label,
            b.revenue.toFixed(2),
            b.billingTotal.toFixed(2),
            b.billingPaid.toFixed(2),
            (b.billingTotal - b.billingPaid).toFixed(2),
          ])
        )
        filename = 'revenue.csv'
        break
      }
      case 'lessons': {
        const months = parseReportMonths(searchParams.get('months'), {
          defaultValue: 12,
          maxValue: 24,
        })
        const { buckets } = await getLessonsReport(orgId, timezone, months, appLocale)
        csv = toCsv(
          [tc('month'), tc('lessons'), tc('cancellations')],
          buckets.map(b => [b.label, String(b.count), String(b.cancelled)])
        )
        filename = 'lessons.csv'
        break
      }
      case 'debt': {
        const { rows } = await getDebtReport(orgId)
        csv = toCsv(
          [tc('parent'), tc('phone'), tc('debt'), tc('dueDate')],
          rows.map(r => [
            r.parentName,
            r.phone,
            r.totalDebt.toFixed(2),
            r.oldestDueDate ?? '',
          ])
        )
        filename = 'debt.csv'
        break
      }
      case 'teachers': {
        const months = parseReportMonths(searchParams.get('months'), {
          defaultValue: 3,
          maxValue: 12,
        })
        const { rows } = await getTeachersReport(orgId, timezone, months)
        csv = toCsv(
          [tc('teacher'), tc('lessons'), tc('revenue')],
          rows.map(r => [r.teacherName, String(r.lessonsCount), r.revenue.toFixed(2)])
        )
        filename = 'teachers.csv'
        break
      }
      case 'students': {
        const { rows } = await getStudentsReport(orgId, timezone)
        csv = toCsv(
          [tc('student'), tc('lessons30d'), tc('lastLesson'), tc('atRisk')],
          rows.map(r => [
            r.studentName,
            String(r.lessonsLast30Days),
            r.lastLessonAt ?? '',
            r.isAtRisk ? tc('yes') : tc('no'),
          ])
        )
        filename = 'students.csv'
        break
      }
      case 'economics': {
        const month = searchParams.get('month') ?? DateTime.now().setZone(timezone).toFormat('yyyy-MM')
        const rows = await getOwnerTeacherEconomicsReport(orgId, month, timezone)
        const optional = (value: number | null) => (value == null ? '' : value.toFixed(2))
        csv = toCsv(
          [tc('teacher'), tc('completed'), tc('noShow'), tc('cancellations'), tc('scheduled'), tc('deliveryHours'), tc('avgStudents'), tc('attributedRevenue'), tc('valuePerHour'), tc('estimatedCompensation'), tc('compensationPerHour'), tc('contribution'), tc('contributionRate'), tc('state'), tc('lessonsWithoutPolicy')],
          rows.map((row) => [
            row.teacherName,
            String(row.completedCount),
            String(row.noShowCount),
            String(row.cancelledCount),
            String(row.scheduledCount),
            row.deliveryHours.toFixed(2),
            row.avgStudents == null ? '' : String(row.avgStudents),
            row.attributedRevenue.toFixed(2),
            optional(row.valuePerHour),
            optional(row.estimatedCompensation),
            optional(row.compensationPerHour),
            optional(row.contribution),
            row.contributionRate == null ? '' : String(row.contributionRate),
            tc(`state_${row.confirmationState}`),
            String(row.attention.missingPolicy),
          ])
        )
        filename = `teacher-economics-${month}.csv`
        break
      }
      case 'economics-lines': {
        const month = searchParams.get('month') ?? DateTime.now().setZone(timezone).toFormat('yyyy-MM')
        const teacherId = searchParams.get('teacherId') ?? undefined
        const rows = await getOwnerTeacherEconomicsReport(orgId, month, timezone, teacherId && /^[0-9a-f-]{36}$/i.test(teacherId) ? teacherId : undefined)
        const optional = (value: number | null) => (value == null ? '' : value.toFixed(2))
        const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone })
        csv = toCsv(
          [tc('teacher'), tc('lessonDate'), tc('student'), tc('lessonType'), tc('outcome'), tc('deliveryHours'), tc('revenueBasis'), tc('attributedRevenue'), tc('estimatedCompensation'), tc('contribution'), tc('state'), tc('warnings')],
          rows.flatMap((row) => row.estimateLines.map((line) => [
            row.teacherName,
            when.format(new Date(line.startAt)),
            line.studentNames.join(' | '),
            tc(`lessonType_${line.lessonType}`),
            tc(`outcome_${line.outcome}`),
            line.durationHours.toFixed(2),
            tc(`basis_${line.revenueBasis}`) + (line.subscriptionCovered ? ` (${tc('basis_subscriptionCovered')})` : ''),
            line.attributedRevenue.toFixed(2),
            optional(line.estimatedCompensation),
            optional(line.contribution),
            tc(`state_${line.confirmationState}`),
            line.warnings.map((warning) => tc(`warning_${warning}`)).join(' | '),
          ]))
        )
        filename = `teacher-economics-lines-${month}.csv`
        break
      }
      default:
        return new NextResponse('Not Found', { status: 404 })
    }
  } catch (err) {
    console.error(`[reports/csv] Failed to generate ${report} report`, err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

