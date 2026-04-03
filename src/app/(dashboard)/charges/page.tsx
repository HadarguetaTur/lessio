import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { getCharges, ChargeStatus } from '@/lib/charges'
import { getParents } from '@/lib/parents'
import { MarkAsPaidButton } from '@/components/dashboard/charges/MarkAsPaidButton'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { markAsPaid } from './actions'

const STATUS_LABELS: Record<ChargeStatus, string> = {
  pending: 'ממתין',
  invoiced: 'חויב',
  paid: 'שולם',
}

const STATUS_STYLES: Record<ChargeStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  invoiced: 'bg-blue-50 text-blue-700',
  paid: 'bg-green-50 text-green-700',
}

const CHARGE_TYPE_LABELS: Record<string, string> = {
  lesson: 'שיעור',
  cancellation: 'ביטול',
  manual: 'ידני',
}

export default async function ChargesPage(props: {
  searchParams: Promise<{ status?: string; parent?: string; from?: string; to?: string }>
}) {
  const searchParams = await props.searchParams
  const { orgId, role } = await getSession()

  const validStatuses: ChargeStatus[] = ['pending', 'invoiced', 'paid']
  const statusFilter = validStatuses.includes(searchParams.status as ChargeStatus)
    ? (searchParams.status as ChargeStatus)
    : undefined

  const [charges, parents] = await Promise.all([
    getCharges(orgId, {
      status: statusFilter,
      parentId: searchParams.parent || undefined,
      dateFrom: searchParams.from || undefined,
      dateTo: searchParams.to || undefined,
    }),
    getParents(orgId),
  ])

  const canMarkPaid = role === 'owner' || role === 'admin'
  const selectedParent = parents.find((parent) => parent.id === searchParams.parent)

  // Aging totals — computed from the already-fetched charges array
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const pendingTotal = charges.filter((c) => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0)
  const invoicedTotal = charges.filter((c) => c.status === 'invoiced').reduce((sum, c) => sum + c.amount, 0)
  const paidThisMonth = charges
    .filter((c) => c.status === 'paid' && c.paid_at && new Date(c.paid_at) >= monthStart)
    .reduce((sum, c) => sum + c.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">חיובים</h1>
      </div>

      {/* Aging summary */}
      {charges.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-100 p-4 mb-4 flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">ממתין לתשלום</p>
            <p className="text-base font-semibold text-gray-900">₪{pendingTotal.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">חויב</p>
            <p className="text-base font-semibold text-gray-900">₪{invoicedTotal.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">שולם החודש</p>
            <p className="text-base font-semibold text-green-700">₪{paidThisMonth.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <form method="GET" className="bg-white rounded-lg border border-gray-100 p-4 mb-5 flex flex-wrap gap-3 items-end">
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">כל הסטטוסים</option>
          {validStatuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          name="parent"
          defaultValue={searchParams.parent ?? ''}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">כל ההורים</option>
          {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.full_name}
            </option>
          ))}
        </select>

        <input
          name="from"
          type="date"
          defaultValue={searchParams.from ?? ''}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          name="to"
          type="date"
          defaultValue={searchParams.to ?? ''}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          סנן
        </button>
        <a
          href="/charges"
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          איפוס
        </a>
      </form>

      {selectedParent && (
        <p className="mb-4 text-sm text-gray-500">
          מוצגים חיובים עבור: <span className="font-medium text-gray-700">{selectedParent.full_name}</span>
        </p>
      )}

      {charges.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 flex flex-col items-center gap-2">
          <Receipt size={32} className="text-gray-200" />
          <p className="text-sm text-gray-400">לא נמצאו חיובים</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  הורה
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">
                  פרטים
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  סוג
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  סכום
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  סטטוס
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  קישור תשלום
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  קבלה
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  תאריך יצירה
                </th>
                {canMarkPaid && (
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    פעולות
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {charges.map((charge) => (
                <tr key={charge.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {charge.parent.full_name}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/charges/${charge.id}`}
                      className="text-blue-600 hover:underline text-xs font-medium"
                    >
                      פרטים
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <div>{CHARGE_TYPE_LABELS[charge.charge_type] ?? charge.charge_type}</div>
                    {charge.notes && (
                      <div className="mt-1 text-xs text-gray-400">{charge.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-mono" dir="ltr">
                    ₪{charge.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[charge.status]}`}
                    >
                      {STATUS_LABELS[charge.status]}
                    </span>
                    {charge.status === 'paid' && charge.payment_provider && (
                      <div className="mt-1 text-xs text-gray-400">
                        דרך {getProviderUI(charge.payment_provider)?.label ?? charge.payment_provider}
                      </div>
                    )}
                    {charge.status === 'paid' && !charge.payment_provider && charge.paid_at && (
                      <div className="mt-1 text-xs text-gray-400">סומן ידנית</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {charge.payment_link ? (
                      <a
                        href={charge.payment_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs truncate max-w-[120px] inline-block"
                        title={charge.payment_link}
                      >
                        לינק לתשלום ↗
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {charge.receipt_url ? (
                      <a
                        href={charge.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-green-600 hover:underline text-xs"
                        title="צפה בקבלה"
                      >
                        קבלה הופקה ↗
                      </a>
                    ) : charge.status === 'paid' ? (
                      <span className="text-xs text-gray-400">לא הופקה</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(charge.created_at).toLocaleDateString('he-IL')}
                  </td>
                  {canMarkPaid && (
                    <td className="px-4 py-3">
                      {charge.status !== 'paid' ? (
                        <MarkAsPaidButton chargeId={charge.id} action={markAsPaid} />
                      ) : (
                        <span className="text-xs text-gray-400">שולם</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
