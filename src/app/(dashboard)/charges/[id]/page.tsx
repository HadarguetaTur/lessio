import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getChargeById, ChargeStatus } from '@/lib/charges'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { MarkAsPaidButton } from '@/components/dashboard/charges/MarkAsPaidButton'
import { markAsPaid } from '../actions'

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

export default async function ChargeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { orgId, role } = await getSession()
  const charge = await getChargeById(orgId, id)

  if (!charge) {
    notFound()
  }

  const canMarkPaid = role === 'owner' || role === 'admin'

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link
          href="/charges"
          className="text-sm text-blue-600 hover:underline"
        >
          ← חזרה לחיובים
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">חיוב</h1>
      <p className="text-sm text-gray-500 mb-6 font-mono" dir="ltr">
        {charge.id}
      </p>

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        <dl className="p-4 grid grid-cols-1 gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">הורה</dt>
            <dd className="font-medium text-gray-900">{charge.parent.full_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">סוג</dt>
            <dd className="text-gray-900">
              {CHARGE_TYPE_LABELS[charge.charge_type] ?? charge.charge_type}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">סכום</dt>
            <dd className="font-mono text-gray-900" dir="ltr">
              ₪{charge.amount.toFixed(2)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 items-center">
            <dt className="text-gray-500">סטטוס</dt>
            <dd>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[charge.status]}`}
              >
                {STATUS_LABELS[charge.status]}
              </span>
              {charge.status === 'paid' && charge.payment_provider && (
                <span className="block text-xs text-gray-400 mt-1">
                  דרך {getProviderUI(charge.payment_provider)?.label ?? charge.payment_provider}
                </span>
              )}
              {charge.status === 'paid' && !charge.payment_provider && charge.paid_at && (
                <span className="block text-xs text-gray-400 mt-1">סומן ידנית</span>
              )}
            </dd>
          </div>
          {charge.notes && (
            <div>
              <dt className="text-gray-500 mb-1">הערות</dt>
              <dd className="text-gray-800">{charge.notes}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">נוצר</dt>
            <dd className="text-gray-700">
              {new Date(charge.created_at).toLocaleDateString('he-IL')}
            </dd>
          </div>
          {charge.paid_at && (
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">שולם</dt>
              <dd className="text-gray-700">
                {new Date(charge.paid_at).toLocaleString('he-IL')}
              </dd>
            </div>
          )}
        </dl>

        <div className="p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            קבלה
          </h2>
          {charge.receipt_url ? (
            <a
              href={charge.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
            >
              צפה בקבלה ↗
            </a>
          ) : charge.status === 'paid' ? (
            <p className="text-sm text-gray-500">לא הופקה קבלה (או ממתין להפקה)</p>
          ) : (
            <p className="text-sm text-gray-400">קבלה תופק לאחר סימון תשלום</p>
          )}
        </div>

        {charge.payment_link && (
          <div className="p-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              קישור תשלום
            </h2>
            <a
              href={charge.payment_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline break-all"
            >
              {charge.payment_link}
            </a>
          </div>
        )}

        {canMarkPaid && charge.status !== 'paid' && (
          <div className="p-4 flex items-center gap-3">
            <MarkAsPaidButton chargeId={charge.id} action={markAsPaid} />
          </div>
        )}
      </div>
    </div>
  )
}
