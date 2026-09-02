import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getChargeById, ChargeStatus, getChargeRemaining } from '@/lib/charges'
import { getChargeAuditLog } from '@/lib/charges/audit'
import { getChargePayments } from '@/lib/charges/payments'
import { ChargePaymentsList } from '@/components/dashboard/charges/ChargePaymentsList'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { renderChargeNote } from '@/lib/charges/renderNote'
import { RecordPaymentDialog } from '@/components/dashboard/charges/RecordPaymentDialog'
import { ResolveChargeDialog } from '@/components/dashboard/charges/ResolveChargeDialog'
import { ChargeAuditTimeline } from '@/components/dashboard/charges/ChargeAuditTimeline'
import { StatusBadge } from '@/components/ui/status-badge'
import { waiveChargeAction, voidChargeAction, recordChargePaymentAction } from '../actions'
import { getLocale, getTranslations } from 'next-intl/server'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { formatBillingMonth } from '@/lib/i18n/formatBillingMonth'
import { formatCurrency } from '@/lib/i18n/formatCurrency'
import { DateTime } from 'luxon'

const STATUS_STYLES: Record<ChargeStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  invoiced: 'bg-blue-50 text-blue-700',
  paid: 'bg-green-50 text-green-700',
  waived: 'bg-slate-100 text-slate-600',
  voided: 'bg-slate-100 text-slate-500 line-through',
}

const OPEN_STATUSES: ChargeStatus[] = ['pending', 'invoiced']

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

  const [auditEntries, payments] = await Promise.all([
    getChargeAuditLog(orgId, charge.id),
    getChargePayments(orgId, charge.id),
  ])
  const remaining = getChargeRemaining(charge.amount, charge.amount_paid)
  const canMarkPaid = role === 'owner' || role === 'admin'
  const isOwner = role === 'owner'
  const isOpen = OPEN_STATUSES.includes(charge.status)
  const t = await getTranslations('charges')
  const tp = await getTranslations('settings.paymentProviders')
  const tCommon = await getTranslations('common')
  const tRoot = await getTranslations()
  const appLocale = parseAppLocale(await getLocale())
  const intlLocale = toIntlLocale(appLocale)
  const chargeTitle = `${formatBillingMonth(DateTime.fromISO(charge.created_at).toFormat('yyyy-MM'), appLocale)} — ${charge.parent.full_name}`
  const amountLabel = charge.status === 'paid'
    ? formatCurrency(charge.amount, appLocale, 2)
    : formatCurrency(remaining, appLocale, 2)

  const STATUS_LABELS: Record<ChargeStatus, string> = {
    pending: tCommon('chargeStatus.pending'),
    invoiced: tCommon('chargeStatus.invoiced'),
    paid: tCommon('chargeStatus.paid'),
    waived: tCommon('chargeStatus.waived'),
    voided: tCommon('chargeStatus.voided'),
  }

  const CHARGE_TYPE_LABELS: Record<string, string> = {
    lesson: t('types.lesson'),
    cancellation: t('types.cancellation'),
    manual: t('types.manual'),
    monthly: t('types.monthly'),
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link
          href="/charges"
          className="text-sm text-blue-600 hover:underline"
        >
          {t('backToCharges')}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-foreground">
          {chargeTitle}
        </h1>
        <StatusBadge status={charge.status} />
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        {CHARGE_TYPE_LABELS[charge.charge_type] ?? charge.charge_type} · {new Date(charge.created_at).toLocaleDateString(intlLocale)}
      </p>

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        <dl className="p-4 grid grid-cols-1 gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t('fields.parent')}</dt>
            <dd className="font-medium text-gray-900">{charge.parent.full_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t('fieldType')}</dt>
            <dd className="text-gray-900">
              {CHARGE_TYPE_LABELS[charge.charge_type] ?? charge.charge_type}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t('fields.amount')}</dt>
            <dd className="font-mono text-gray-900" dir="ltr">
              {amountLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-4 items-center">
            <dt className="text-muted-foreground">{t('fields.status')}</dt>
            <dd>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[charge.status]}`}
              >
                {STATUS_LABELS[charge.status]}
              </span>
              {charge.status === 'paid' && charge.payment_provider && (
                <span className="block text-xs text-muted-foreground mt-1">
                  {t('via', { provider: getProviderUI(charge.payment_provider) ? tp(`${charge.payment_provider}.label`) : charge.payment_provider })}
                </span>
              )}
              {charge.status === 'paid' && !charge.payment_provider && charge.paid_at && (
                <span className="block text-xs text-muted-foreground mt-1">{t('markedManually')}</span>
              )}
            </dd>
          </div>
          {charge.notes && (
            <div>
              <dt className="text-muted-foreground mb-1">{t('fieldNotes')}</dt>
              <dd className="text-gray-800">{renderChargeNote(charge.notes, tRoot)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t('fieldCreated')}</dt>
            <dd className="text-gray-700">
              {new Date(charge.created_at).toLocaleDateString(intlLocale)}
            </dd>
          </div>
          {charge.paid_at && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('fieldPaidAt')}</dt>
              <dd className="text-gray-700">
                {new Date(charge.paid_at).toLocaleString(intlLocale)}
              </dd>
            </div>
          )}
          {charge.resolved_at && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('resolve.resolvedAt')}</dt>
              <dd className="text-gray-700">
                {new Date(charge.resolved_at).toLocaleString(intlLocale)}
              </dd>
            </div>
          )}
          {charge.resolution_reason && (
            <div>
              <dt className="text-muted-foreground mb-1">{t('resolve.reasonLabel')}</dt>
              <dd className="text-gray-800">{charge.resolution_reason}</dd>
            </div>
          )}
        </dl>

        <div className="p-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t('fields.receiptUrl')}
          </h2>
          {charge.receipt_url ? (
            <a
              href={charge.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-green-700 hover:underline font-medium"
            >
              {t('viewReceipt')}
            </a>
          ) : charge.status === 'paid' ? (
            <p className="text-sm text-muted-foreground">{t('noReceiptIssued')}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('pendingReceipt')}</p>
          )}
        </div>

        {charge.payment_link && (
          <div className="p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {t('paymentLink')}
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

        {canMarkPaid && isOpen && (
          <div className="p-4 flex flex-wrap items-center gap-3">
            <RecordPaymentDialog
              chargeId={charge.id}
              remaining={remaining}
              parentHasPhone={Boolean(charge.parent.phone)}
              action={recordChargePaymentAction}
            />
            <ResolveChargeDialog
              chargeId={charge.id}
              mode="waive"
              action={waiveChargeAction}
              hasPaymentLink={Boolean(charge.payment_link)}
              hasInvoice={charge.has_invoice}
            />
            {isOwner && (
              <ResolveChargeDialog
                chargeId={charge.id}
                mode="void"
                action={voidChargeAction}
                hasPaymentLink={Boolean(charge.payment_link)}
                hasInvoice={charge.has_invoice}
              />
            )}
          </div>
        )}

        {payments.length > 0 && (
          <div className="p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {t('payments.title')}
            </h2>
            <ChargePaymentsList payments={payments} total={charge.amount} paid={charge.amount_paid} />
          </div>
        )}

        <div className="p-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {t('audit.title')}
          </h2>
          <ChargeAuditTimeline entries={auditEntries} />
        </div>
      </div>
    </div>
  )
}
