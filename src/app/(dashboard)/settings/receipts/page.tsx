import { forbidden } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CheckCircle, AlertCircle, CreditCard, MinusCircle } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { type ReceiptProviderType } from '@/lib/receipts/factory'
import type { ReceiptMode } from '@/lib/receipts'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { ReceiptSettingsForm } from './ReceiptSettingsForm'
import { ReceiptModeChooser } from './ReceiptModeChooser'
import { DisconnectReceiptButton } from './DisconnectReceiptButton'
import { ChangeReceiptModeButton } from './ChangeReceiptModeButton'
import { setReceiptModeAction } from './actions'

/**
 * Receipt provider settings page — owner only.
 *
 * The screen opens by asking who issues this org's invoices, and only then
 * offers a credentials form. Before that question existed, the form arrived
 * with a provider pre-selected and an owner whose payment provider already
 * issued invoices would connect a second service, producing two tax documents
 * for one payment.
 */
export default async function ReceiptSettingsPage() {
  const tp = await getTranslations('settings')
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.receipts')

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('receipt_config_encrypted, receipt_provider, receipt_mode, payment_provider')
    .eq('id', orgId)
    .single()

  const mode = (org?.receipt_mode ?? null) as ReceiptMode | null
  const isConnected = Boolean(org?.receipt_config_encrypted)
  const providerType = (org?.receipt_provider ?? 'green-invoice') as ReceiptProviderType
  const providerLabel = tp(`receiptProviders.${providerType}`)

  // Only a provider the catalog knows can be named on screen; anything else
  // (a demo value, a provider removed from the registry) leaves the
  // payment-provider option out rather than rendering a missing-key error.
  const paymentProviderId = org?.payment_provider as string | null
  const paymentProviderLabel =
    paymentProviderId && getProviderUI(paymentProviderId)
      ? tp(`paymentProviders.${paymentProviderId}.label`)
      : null

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-8">{tp('receiptsPage.subtitle')}</p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {mode === null && (
          <ReceiptModeChooser
            paymentProviderLabel={paymentProviderLabel}
            onChoose={setReceiptModeAction}
          />
        )}

        {mode === 'external' &&
          (isConnected ? (
            <ConnectedState providerLabel={providerLabel} connected={t('connected')} />
          ) : (
            <DisconnectedState />
          ))}

        {mode === 'payment_provider' && (
          <ModeSummary
            icon="payment"
            title={tp('receiptMode.paymentProvider.summaryTitle', {
              provider: paymentProviderLabel ?? tp('receiptMode.paymentProvider.fallbackName'),
            })}
            body={tp('receiptMode.paymentProvider.summaryBody')}
          />
        )}

        {mode === 'none' && (
          <ModeSummary
            icon="none"
            title={tp('receiptMode.none.summaryTitle')}
            body={tp('receiptMode.none.summaryBody')}
          />
        )}
      </div>

      {/* The two screens are one decision split across the menu. Whichever the
          owner lands on first should point at the other. */}
      <p className="mt-4 text-sm text-muted-foreground">
        {tp('receiptMode.paymentLinkPrefix')}{' '}
        <Link href="/settings/payment" className="text-blue-600 underline">
          {tp('receiptMode.paymentLinkText')}
        </Link>
      </p>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">{tp('receiptsPage.securityTitle')}</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>{tp('receiptsPage.security1')}</li>
          <li>{tp('receiptsPage.security2')}</li>
          <li>{tp('receiptsPage.security3')}</li>
        </ul>
      </div>
    </div>
  )
}

/** Shared shape for the two states that need no credentials. */
async function ModeSummary({
  icon,
  title,
  body,
}: {
  icon: 'payment' | 'none'
  title: string
  body: string
}) {
  const Icon = icon === 'payment' ? CreditCard : MinusCircle
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Icon size={20} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
        <div>
          <p className="font-medium text-sm text-gray-900">{title}</p>
          <p className="text-sm text-gray-600 mt-1">{body}</p>
        </div>
      </div>

      <hr className="border-gray-100" />

      <ChangeReceiptModeButton />
    </div>
  )
}

async function ConnectedState({ providerLabel, connected }: { providerLabel: string; connected: string }) {
  const tp = await getTranslations('settings')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle size={20} />
        <span className="font-medium text-sm">{connected} — {providerLabel}</span>
      </div>

      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{tp('receiptsPage.providerLabel')}</dt>
          <dd className="font-medium text-gray-900">{providerLabel}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{tp('receiptsPage.apiDetailsLabel')}</dt>
          <dd className="text-muted-foreground text-xs">{tp('receiptsPage.apiDetailsValue')}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{tp('receiptsPage.autoIssueLabel')}</dt>
          <dd className="text-gray-600 text-xs">{tp('receiptsPage.autoIssueValue')}</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-muted-foreground mb-2">{tp('receiptsPage.disconnectHint')}</p>
        <DisconnectReceiptButton />
      </div>
    </div>
  )
}

async function DisconnectedState() {
  const tp = await getTranslations('settings')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle size={20} />
        <span className="font-medium text-sm">{tp('googleCommon.notConnected')}</span>
      </div>

      <p className="text-sm text-gray-600">{tp('receiptsPage.disconnectedHint')}</p>

      <ReceiptSettingsForm />

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-muted-foreground mb-2">{tp('receiptMode.wrongChoiceHint')}</p>
        <ChangeReceiptModeButton />
      </div>
    </div>
  )
}
