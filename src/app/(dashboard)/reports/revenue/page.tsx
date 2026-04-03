import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getOrgTimezone } from '@/lib/organizations'
import { getRevenueReport } from '@/lib/reports/revenue'
import { parseReportMonths } from '@/lib/reports/params'
import { RevenueChart } from '@/components/reports/RevenueChart'
import { CsvDownloadButton } from '@/components/reports/CsvDownloadButton'
import { PeriodSelector } from '@/components/reports/PeriodSelector'

/**
 * Revenue report page.
 * Per /docs/sprint-17-scope.md § Story 3.
 */

interface Props {
  searchParams: Promise<{ months?: string }>
}

export default async function RevenueReportPage({ searchParams }: Props) {
  const session = await getSession()
  if (!['owner', 'admin'].includes(session.role)) redirect('/dashboard')

  const { months: monthsParam } = await searchParams
  const months = parseReportMonths(monthsParam, { defaultValue: 12, maxValue: 24 })

  const timezone = await getOrgTimezone(session.orgId)
  const { buckets, total } = await getRevenueReport(session.orgId, timezone, months)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">הכנסות</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            סה״כ: <span className="font-semibold text-gray-800">₪{total.toLocaleString('he-IL')}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector current={months} />
          <CsvDownloadButton report="revenue" params={{ months: String(months) }} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <RevenueChart buckets={buckets} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-right px-4 py-3 font-medium text-gray-500">חודש</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">הכנסות</th>
            </tr>
          </thead>
          <tbody>
            {[...buckets].reverse().map(b => (
              <tr key={b.month} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{b.label}</td>
                <td className="px-4 py-3 font-medium text-gray-900 tabular-nums">
                  ₪{b.revenue.toLocaleString('he-IL')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
