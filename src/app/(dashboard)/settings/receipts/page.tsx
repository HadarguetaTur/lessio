import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { type ReceiptProviderType } from '@/lib/receipts/factory'
import { ReceiptSettingsForm } from './ReceiptSettingsForm'
import { DisconnectReceiptButton } from './DisconnectReceiptButton'

/**
 * Receipt provider settings page — owner only.
 *
 * Supports Green Invoice (Morning), iCount, and Sumit.
 * Credentials are AES-256-GCM encrypted and never displayed.
 * The receipt_provider column is plaintext for display without decryption.
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
    .select('receipt_config_encrypted, receipt_provider')
    .eq('id', orgId)
    .single()

  const isConnected = Boolean(org?.receipt_config_encrypted)
  const providerType = (org?.receipt_provider ?? 'green-invoice') as ReceiptProviderType
  const providerLabel = providerType ? tp(`receiptProviders.${providerType}`) : ''

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-gray-500 mb-8">{tp('receiptsPage.subtitle')}</p>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {isConnected
          ? <ConnectedState providerLabel={providerLabel} connected={t('connected')} disconnect={t('disconnect')} />
          : <DisconnectedState />}
      </div>

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

async function ConnectedState({ providerLabel, connected, disconnect }: { providerLabel: string; connected: string; disconnect: string }) {
  const tp = await getTranslations('settings')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle size={20} />
        <span className="font-medium text-sm">{connected} — {providerLabel}</span>
      </div>

      <dl className="text-sm space-y-2">
        <div className="flex justify-between">
          <dt className="text-gray-500">{tp('receiptsPage.providerLabel')}</dt>
          <dd className="font-medium text-gray-900">{providerLabel}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">{tp('receiptsPage.apiDetailsLabel')}</dt>
          <dd className="text-gray-400 text-xs">{tp('receiptsPage.apiDetailsValue')}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-500">{tp('receiptsPage.autoIssueLabel')}</dt>
          <dd className="text-gray-600 text-xs">{tp('receiptsPage.autoIssueValue')}</dd>
        </div>
      </dl>

      <hr className="border-gray-100" />

      <div>
        <p className="text-xs text-gray-500 mb-2">{tp('receiptsPage.disconnectHint')}</p>
        <DisconnectReceiptButton />
      </div>
    </div>
  )
}

async function DisconnectedState() {
  const tp = await getTranslations('settings')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-500">
        <AlertCircle size={20} />
        <span className="font-medium text-sm">{tp('googleCommon.notConnected')}</span>
      </div>

      <p className="text-sm text-gray-600">{tp('receiptsPage.disconnectedHint')}</p>

      <ReceiptSettingsForm />
    </div>
  )
}
