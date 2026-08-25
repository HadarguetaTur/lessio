'use client'

/**
 * Payment provider connection form.
 * Renders dynamically from PROVIDERS_UI in registry-ui.ts.
 *
 * To add a new provider: update registry-ui.ts + registry.ts only.
 * This component requires no changes when new providers are added.
 */

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ExternalLink } from 'lucide-react'
import { PROVIDERS_UI, type ProviderUIDef } from '@/lib/payments/registry-ui'
import { savePaymentProvider, type PaymentActionResult } from './actions'

const initialState: PaymentActionResult = { error: null }

export function PaymentProviderForm() {
  const t = useTranslations('settings.payment')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(savePaymentProvider, initialState)
  const tp = useTranslations('settings.paymentProviders')
  const [selectedId, setSelectedId] = useState<string>(PROVIDERS_UI[0]?.id ?? '')

  const selectedProvider = PROVIDERS_UI.find(p => p.id === selectedId)

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {/* Provider selector */}
      <div>
        <label htmlFor="provider" className="block text-sm font-medium text-gray-700 mb-1">
          {t('provider')}
        </label>
        <select
          id="provider"
          name="provider"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PROVIDERS_UI.map((p) => (
            <option key={p.id} value={p.id}>
              {tp(`${p.id}.label`)}
            </option>
          ))}
        </select>
        {selectedProvider && (
          <p className="mt-1 text-xs text-muted-foreground">{tp(`${selectedProvider.id}.description`)}</p>
        )}
      </div>

      {selectedProvider && <ProviderFields provider={selectedProvider} />}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? `${tCommon('actions.save')}…` : tCommon('actions.save')}
      </button>
    </form>
  )
}

function ProviderFields({ provider }: { provider: ProviderUIDef }) {
  const t = useTranslations('settings.payment')
  const tp = useTranslations(`settings.paymentProviders.${provider.id}`)
  return (
    <div className="space-y-4">
      <hr className="border-gray-100" />

      {(
        <div className="text-xs text-muted-foreground bg-gray-50 rounded-md p-3 leading-relaxed">
          {tp('setupHint')}
          {provider.docsUrl && (
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline mr-1"
            >
              <ExternalLink size={11} />
              {t('developerDocs')}
            </a>
          )}
        </div>
      )}

      {provider.fields.map((field) => (
        <div key={field.name}>
          <label
            htmlFor={field.name}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {tp(`fields.${field.name}.label`)}
          </label>
          <input
            id={field.name}
            name={field.name}
            type={field.type}
            autoComplete={field.type === 'password' ? 'new-password' : 'off'}
            required
            placeholder={field.hasPlaceholder ? tp(`fields.${field.name}.placeholder`) : undefined}
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          {field.hasHint && (
            <p className="mt-1 text-xs text-muted-foreground">{tp(`fields.${field.name}.hint`)}</p>
          )}
        </div>
      ))}
    </div>
  )
}
