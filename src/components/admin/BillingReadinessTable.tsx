import Link from 'next/link'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'
import type { OrgBillingRow } from '@/lib/superadmin/billing'

interface Props {
  rows: OrgBillingRow[]
}

function Fmt({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted-foreground">—</span>
  return <>{DateTime.fromISO(iso).toFormat('dd/MM/yyyy')}</>
}

export async function BillingReadinessTable({ rows }: Props) {
  const t = await getTranslations('admin')
  const yesLabel = t('orgs.table.yes')
  const noLabel = t('orgs.table.no')

  function Yn({ value }: { value: boolean }) {
    return (
      <span className={value ? 'text-green-700 font-medium' : 'text-muted-foreground'}>
        {value ? yesLabel : noLabel}
      </span>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-start">
            <th className="px-4 py-3 font-medium text-muted-foreground">{t('billing.headers.org')}</th>
            <th className="px-4 py-3 font-medium text-muted-foreground text-center">{t('billing.headers.paymentProvider')}</th>
            <th className="px-4 py-3 font-medium text-muted-foreground text-center">{t('billing.headers.receipts')}</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">{t('billing.headers.firstPayment')}</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">{t('billing.headers.totalRevenue')}</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">{t('billing.headers.lastPayment')}</th>
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
                {r.totalPaidRevenue > 0 ? `₪${r.totalPaidRevenue.toLocaleString('he-IL')}` : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3 text-gray-700"><Fmt iso={r.lastPaidChargeDate} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
