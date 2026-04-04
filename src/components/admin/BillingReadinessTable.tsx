import Link from 'next/link'
import { DateTime } from 'luxon'
import type { OrgBillingRow } from '@/lib/superadmin/billing'

interface Props {
  rows: OrgBillingRow[]
}

function Yn({ value }: { value: boolean }) {
  return (
    <span className={value ? 'text-green-600 font-medium' : 'text-gray-400'}>
      {value ? 'כן' : 'לא'}
    </span>
  )
}

function Fmt({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-gray-400">—</span>
  return <>{DateTime.fromISO(iso).toFormat('dd/MM/yyyy')}</>
}

export function BillingReadinessTable({ rows }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-right">
            <th className="px-4 py-3 font-medium text-gray-500">ארגון</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-center">תשלומים</th>
            <th className="px-4 py-3 font-medium text-gray-500 text-center">קבלות</th>
            <th className="px-4 py-3 font-medium text-gray-500">תשלום ראשון</th>
            <th className="px-4 py-3 font-medium text-gray-500">סה״כ הכנסות</th>
            <th className="px-4 py-3 font-medium text-gray-500">תשלום אחרון</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3">
                <Link href={`/admin/orgs/${r.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                  {r.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-center"><Yn value={r.paymentConnected} /></td>
              <td className="px-4 py-3 text-center"><Yn value={r.receiptConnected} /></td>
              <td className="px-4 py-3 text-gray-700"><Fmt iso={r.firstPaidChargeDate} /></td>
              <td className="px-4 py-3 font-medium text-gray-900 tabular-nums">
                {r.totalPaidRevenue > 0 ? `₪${r.totalPaidRevenue.toLocaleString('he-IL')}` : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-4 py-3 text-gray-700"><Fmt iso={r.lastPaidChargeDate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
