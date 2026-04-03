import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getTeachersReport } from '@/lib/reports/teachers'
import { parseReportMonths } from '@/lib/reports/params'
import { TeachersChart } from '@/components/reports/TeachersChart'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import { PeriodSelector } from '@/components/reports/PeriodSelector'

/**
 * Teachers report page.
 * Per /docs/sprint-17-scope.md § Story 6.
 */

interface Props {
  searchParams: Promise<{ months?: string }>
}

export default async function TeachersReportPage({ searchParams }: Props) {
  const session = await getSession()
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')

  const { months: monthsParam } = await searchParams
  const months = parseReportMonths(monthsParam, { defaultValue: 3, maxValue: 12 })

  const timezone = await getOrgTimezone(session.orgId)
  const { rows } = await getTeachersReport(session.orgId, timezone, months)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מורים</h1>
          <p className="text-gray-500 text-sm mt-0.5">{rows.length} מורים פעילים</p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector current={months} options={[1, 3, 6, 12]} />
          <CsvDownloadButton report="teachers" params={{ months: String(months) }} />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <TeachersChart rows={rows} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-right px-4 py-3 font-medium text-gray-500">מורה</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">שיעורים</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">הכנסות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.teacherId} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900 font-medium">{r.teacherName}</td>
                <td className="px-4 py-3 text-gray-700 tabular-nums">{r.lessonsCount}</td>
                <td className="px-4 py-3 font-medium text-gray-900 tabular-nums">
                  ₪{r.revenue.toLocaleString('he-IL')}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  אין נתונים לתקופה זו
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
