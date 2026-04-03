import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getDebtReport } from '@/lib/reports/debt'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'

/**
 * Debt report page — parents with pending charges.
 * Per /docs/sprint-17-scope.md § Story 5.
 */

export default async function DebtReportPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')

  const { rows, totalDebt } = await getDebtReport(session.orgId)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">חובות</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            סה״כ חוב: <span className="font-semibold text-gray-800">₪{totalDebt.toLocaleString('he-IL')}</span>
            {' '}· {rows.length} הורים
          </p>
        </div>
        <CsvDownloadButton report="debt" />
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          אין חובות פתוחים 🎉
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-right px-4 py-3 font-medium text-gray-500">הורה</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">טלפון</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">חוב</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">תאריך יעד</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.parentId} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{r.parentName}</td>
                  <td className="px-4 py-3 text-gray-500 tabular-nums" dir="ltr">{r.phone}</td>
                  <td className="px-4 py-3 font-semibold text-red-600 tabular-nums">
                    ₪{r.totalDebt.toLocaleString('he-IL')}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.oldestDueDate
                      ? new Date(r.oldestDueDate).toLocaleDateString('he-IL')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
