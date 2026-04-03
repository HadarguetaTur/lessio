import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getStudentsReport } from '@/lib/reports/students'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import { DateTime } from 'luxon'

/**
 * Students report page — activity overview and at-risk detection.
 * Per /docs/sprint-17-scope.md § Story 7.
 */

export default async function StudentsReportPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')

  const timezone = await getOrgTimezone(session.orgId)
  const { rows, atRiskCount } = await getStudentsReport(session.orgId, timezone)

  function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return DateTime.fromISO(iso, { zone: 'utc' })
      .setZone(timezone)
      .setLocale('he')
      .toFormat('d בLLLL yyyy')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">תלמידים</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            <span className="font-semibold text-gray-800">{rows.length}</span> תלמידים פעילים
            {atRiskCount > 0 && (
              <>
                {' '}·{' '}
                <span className="font-semibold text-red-500">{atRiskCount}</span> בסיכון (אין שיעור ב-30 יום)
              </>
            )}
          </p>
        </div>
        <CsvDownloadButton report="students" />
      </div>

      {atRiskCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-red-700 mb-2">⚠️ תלמידים בסיכון</p>
          <div className="flex flex-wrap gap-2">
            {rows.filter(r => r.isAtRisk).map(r => (
              <span key={r.studentId} className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">
                {r.studentName}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-right px-4 py-3 font-medium text-gray-500">תלמיד</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">שיעורים ב-30 יום</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">שיעור אחרון</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.studentId} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900 font-medium">{r.studentName}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{r.lessonsLast30Days}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(r.lastLessonAt)}</td>
                <td className="px-4 py-3">
                  {r.isAtRisk ? (
                    <span className="bg-red-50 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium">
                      בסיכון
                    </span>
                  ) : (
                    <span className="bg-green-50 text-green-600 text-xs px-2 py-0.5 rounded-full font-medium">
                      פעיל
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
