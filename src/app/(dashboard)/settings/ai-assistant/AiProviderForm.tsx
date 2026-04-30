'use client'

/**
 * AI provider/model/key configuration form — Sprint 25 Story 1b.
 * Owner selects provider, model, pastes API key, and tests connection.
 * Receives server actions as props (server action prop rule).
 */

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PROVIDER_MODELS, AI_PROVIDER_NAMES } from '@/lib/ai-assistant/providers/models'
import type { AiProviderName } from '@/lib/ai-assistant/providers/types'
import type { AiProviderActionState, TestConnectionActionState } from './actions'

interface Props {
  currentProvider: AiProviderName
  currentModel: string
  hasEncryptedKey: boolean
  saveAction: (
    prevState: AiProviderActionState,
    formData: FormData
  ) => Promise<AiProviderActionState>
  testAction: (
    prevState: TestConnectionActionState,
    formData: FormData
  ) => Promise<TestConnectionActionState>
}

const initialSaveState: AiProviderActionState = { error: null }
const initialTestState: TestConnectionActionState = { error: null }

export function AiProviderForm({
  currentProvider,
  currentModel,
  hasEncryptedKey,
  saveAction,
  testAction,
}: Props) {
  const t = useTranslations('settings.aiAssistant')
  const tCommon = useTranslations('common')

  const [saveState, saveFormAction, isSaving] = useActionState(saveAction, initialSaveState)
  const [testState, testFormAction, isTesting] = useActionState(testAction, initialTestState)

  const [selectedProvider, setSelectedProvider] = useState<AiProviderName>(currentProvider)

  const providerModels = PROVIDER_MODELS[selectedProvider]
  const defaultModel = providerModels.models.some(m => m.id === currentModel)
    ? currentModel
    : providerModels.defaultModel

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-900">{t('providerSettings')}</h2>

      {/* Save form */}
      <form action={saveFormAction} className="space-y-4">
        {/* Provider */}
        <div>
          <label htmlFor="ai_provider" className="block text-sm font-medium text-gray-700 mb-1">
            {t('provider')}
          </label>
          <select
            id="ai_provider"
            name="ai_provider"
            defaultValue={currentProvider}
            onChange={(e) => setSelectedProvider(e.target.value as AiProviderName)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {AI_PROVIDER_NAMES.map((name) => (
              <option key={name} value={name}>
                {PROVIDER_MODELS[name].label}
              </option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label htmlFor="ai_model" className="block text-sm font-medium text-gray-700 mb-1">
            {t('model')}
          </label>
          <select
            id="ai_model"
            name="ai_model"
            defaultValue={defaultModel}
            key={selectedProvider}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {providerModels.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div>
          <label htmlFor="api_key" className="block text-sm font-medium text-gray-700 mb-1">
            {t('apiKey')}
          </label>
          <input
            id="api_key"
            name="api_key"
            type="password"
            autoComplete="off"
            placeholder={hasEncryptedKey ? t('apiKeyPlaceholderSaved') : t('apiKeyPlaceholder')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
          />
          {selectedProvider === 'openai' && (
            <p className="text-xs text-gray-400 mt-1">{t('openaiKeyOptional')}</p>
          )}
          {selectedProvider !== 'openai' && (
            <p className="text-xs text-gray-400 mt-1">{t('apiKeyRequired')}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? `${tCommon('actions.save')}…` : tCommon('actions.save')}
        </button>

        {saveState.success && (
          <p className="text-xs text-green-600">{t('providerSaved')}</p>
        )}
        {saveState.error && (
          <p className="text-xs text-red-500">{saveState.error}</p>
        )}
      </form>

      {/* Test connection form */}
      <form action={testFormAction}>
        <input type="hidden" name="ai_provider" value={selectedProvider} />
        <button
          type="submit"
          disabled={isTesting}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {isTesting ? `${t('testConnection')}…` : t('testConnection')}
        </button>

        {testState.success && (
          <p className="text-xs text-green-600 mt-2">{t('testSuccess')}</p>
        )}
        {testState.error && (
          <p className="text-xs text-red-500 mt-2">{testState.error}</p>
        )}
      </form>
    </div>
  )
}
