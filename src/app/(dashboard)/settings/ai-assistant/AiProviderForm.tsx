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

/** Where an owner actually creates a key, per provider. */
const API_KEY_CONSOLES: Record<AiProviderName, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
}

interface Props {
  currentProvider: AiProviderName
  currentModel: string
  hasEncryptedKey: boolean
  /** Whether the platform itself holds an OpenAI key an org can fall back to. */
  hasPlatformKey: boolean
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
  hasPlatformKey,
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
          {/* "Leave empty to use the system key" is only true when there IS a
              system key. Promising one that does not exist is how a tenant ends
              up switched on with nothing behind it. */}
          <p className="text-xs text-muted-foreground mt-1">
            {selectedProvider === 'openai' && hasPlatformKey
              ? t('openaiKeyOptional')
              : t('apiKeyRequired')}
          </p>
          {/* The page was honest that a key is missing but never said where a
              key comes from — a dead end for a non-technical owner. */}
          <p className="text-xs text-muted-foreground mt-1">
            <a
              href={API_KEY_CONSOLES[selectedProvider]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              {t('whereToGetKey', { provider: providerModels.label })}
            </a>
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? `${tCommon('actions.save')}…` : tCommon('actions.save')}
        </button>

        {saveState.success && (
          <p className="text-xs text-green-700">{t('providerSaved')}</p>
        )}
        {saveState.error && (
          <p className="text-xs text-red-600">{saveState.error}</p>
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

        {/* The action reads the saved configuration and ignores this form's
            current selection, so say so rather than let a "pass" describe a
            provider the user has not saved yet. */}
        <p className="text-xs text-muted-foreground mt-2">{t('testHint')}</p>

        {testState.success && (
          <p className="text-xs text-green-700 mt-2">{t('testSuccess')}</p>
        )}
        {testState.error && (
          <p className="text-xs text-red-600 mt-2">{testState.error}</p>
        )}
      </form>
    </div>
  )
}
