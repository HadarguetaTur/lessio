import { forbidden } from 'next/navigation'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getProviderUI } from '@/lib/payments/registry-ui'
import { PaymentProviderForm } from './PaymentProviderForm'
import { DisconnectPaymentButton } from './DisconnectPaymentButton'
import { AutoSendToggle } from './AutoSendToggle'
import { getTranslations } from 'next-intl/server'

/**
 * Payment provider settings page — owner only.
 * Per /docs/sprint-8-scope.md § Story 3.
 *
 * Reads connected provider from DB. Labels come from registry-ui — no hard-coded strings here.
 * To add a new provider: update registry-ui.ts + registry.ts only.
 */
export default async function PaymentSettingsPage() {
  const { orgId, role } = await getSession()

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('payment_provider, auto_send_payment_request')
    .eq('id', orgId)
    .single()

  const paymentProvider = org?.payment_provider ?? null
  const autoSend = org?.auto_send_payment_request ?? false
  const isConnected = Boolean(paymentProvider)
  const providerUI = paymentProvider ? getProviderUI(paymentProvider) : null
  const t = await getTranslations('settings.payment')
  const tp = await getTranslations('settings.paymentProviders')

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('pageTitle')}</h1>
      <p className="text-sm text-muted-foreground mb-8">{t('pageSubtitle')}</p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {isConnected ? (
          <ConnectedState
            providerLabel={providerUI ? tp(`${providerUI.id}.label`) : paymentProvider!}
            providerDescription={providerUI ? tp(`${providerUI.id}.description`) : undefined}
          />
        ) : (
          <DisconnectedState />
        )}
      </div>

      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-medium text-gray-900 mb-3">{t('automationTitle')}</h2>
        <AutoSendToggle defaultChecked={autoSend} />
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">{t('securityTitle')}</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>{t('security1')}</li>
          <li>{t('security2')}</li>
          <li>{t('security3')}</li>
        </ul>
      </div>
    </div>
  )
}

async function ConnectedState({
  providerLabel,
  providerDescription,
}: {
  providerLabel: string
  providerDescription?: string
}) {
  const t = await getTranslations('settings.payment')
  const tG = await getTranslations('settings.googleCommon')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle size={20} />
        <span className="font-medium text-sm">{tG('connected')}</span>
      </div>

      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('providerLabel')}</dt>
          <dd className="font-medium text-gray-900">{providerLabel}</dd>
        </div>
        {providerDescription && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t('servicesLabel')}</dt>
            <dd className="text-gray-600 text-xs text-left max-w-[220px]">{providerDescription}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t('apiDetailsLabel')}</dt>
          <dd className="text-muted-foreground text-xs">{t('apiDetailsValue')}</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-muted-foreground mb-2">{t('disconnectHint')}</p>
        <DisconnectPaymentButton />
      </div>
    </div>
  )
}

async function DisconnectedState() {
  const t = await getTranslations('settings.payment')
  const tG = await getTranslations('settings.googleCommon')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle size={20} />
        <span className="font-medium text-sm">{tG('notConnected')}</span>
      </div>

      <p className="text-sm text-gray-600">{t('disconnectedHint')}</p>

      <PaymentProviderForm />
    </div>
  )
}
