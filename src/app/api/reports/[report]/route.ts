/**
 * CSV export endpoint for all reports.
 * GET /api/reports/[report]?months=N
 *
 * Requires active session (owner or admin).
 * Returns a UTF-8 CSV with BOM for correct Excel display of Hebrew.
 * Per /docs/sprint-17-scope.md § Story 8.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getRevenueReport } from '@/lib/reports/revenue'
import { getLessonsReport } from '@/lib/reports/lessons'
import { getDebtReport } from '@/lib/reports/debt'
import { getTeachersReport } from '@/lib/reports/teachers'
import { getStudentsReport } from '@/lib/reports/students'
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
  if (!['owner', 'admin'].includes(session.role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { report } = await params
  const { searchParams } = request.nextUrl
  const orgId = session.orgId
  const timezone = await getOrgTimezone(orgId)

  let csv: string
  let filename: string

  try {
    switch (report) {
      case 'revenue': {
        const months = parseReportMonths(searchParams.get('months'), {
          defaultValue: 12,
          maxValue: 24,
        })
        const { buckets } = await getRevenueReport(orgId, timezone, months)
        csv = toCsv(
          ['חודש', 'הכנסות (₪)'],
          buckets.map(b => [b.label, b.revenue.toFixed(2)])
        )
        filename = 'revenue.csv'
        break
      }
      case 'lessons': {
        const months = parseReportMonths(searchParams.get('months'), {
          defaultValue: 12,
          maxValue: 24,
        })
        const { buckets } = await getLessonsReport(orgId, timezone, months)
        csv = toCsv(
          ['חודש', 'שיעורים', 'ביטולים'],
          buckets.map(b => [b.label, String(b.count), String(b.cancelled)])
        )
        filename = 'lessons.csv'
        break
      }
      case 'debt': {
        const { rows } = await getDebtReport(orgId)
        csv = toCsv(
          ['הורה', 'טלפון', 'חוב (₪)', 'תאריך יעד'],
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
          ['מורה', 'שיעורים', 'הכנסות (₪)'],
          rows.map(r => [r.teacherName, String(r.lessonsCount), r.revenue.toFixed(2)])
        )
        filename = 'teachers.csv'
        break
      }
      case 'students': {
        const { rows } = await getStudentsReport(orgId, timezone)
        csv = toCsv(
          ['תלמיד', 'שיעורים ב-30 יום', 'שיעור אחרון', 'סיכון'],
          rows.map(r => [
            r.studentName,
            String(r.lessonsLast30Days),
            r.lastLessonAt ?? '',
            r.isAtRisk ? 'כן' : 'לא',
          ])
        )
        filename = 'students.csv'
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
