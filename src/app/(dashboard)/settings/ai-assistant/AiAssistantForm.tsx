'use client'

/**
 * Client form for toggling AI assistant on/off.
 * Per /docs/sprint-19-scope.md § Story 3.
 */

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import { saveAiAssistantSettings, type AiAssistantActionState } from './actions'
import { resolveAiToggleState } from './toggleState'

interface Props {
  defaultEnabled: boolean
  isConfigured: boolean
}

const initialState: AiAssistantActionState = { error: null }

export function AiAssistantForm({ defaultEnabled, isConfigured }: Props) {
  const tp = useTranslations('settings')
  const t = useTranslations('settings.aiAssistant')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveAiAssistantSettings, initialState)
  const { disabled, onButNotAnswering } = resolveAiToggleState({
    isConfigured,
    currentlyEnabled: defaultEnabled,
  })

  return (
    <form key={String(defaultEnabled)} action={formAction}>
      {!isConfigured && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('keyMissingWarning')}
        </div>
      )}

      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-gray-900">{t('enable')}</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">{tp('aiAssistantForm.enableHint')}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
          <input
            type="checkbox"
            name="ai_assistant_enabled"
            aria-label={t('enable')}
            defaultChecked={defaultEnabled}
            disabled={disabled}
            className="sr-only peer"
            onChange={(e) => {
              // Auto-submit on toggle change
              ;(e.target.form as HTMLFormElement | null)?.requestSubmit()
            }}
          />
          {/* On without a key is not a healthy state, so it does not get the
              healthy blue. */}
          <div
            className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
              onButNotAnswering ? 'peer-checked:bg-amber-500' : 'peer-checked:bg-blue-600'
            }`}
          />
        </label>
      </div>

      {onButNotAnswering && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle size={13} className="shrink-0" aria-hidden />
          {t('onButNotAnswering')}
        </p>
      )}

      {isPending && (
        <p className="text-xs text-muted-foreground mt-3">{tCommon('actions.save')}…</p>
      )}

      {state.success && (
        <p className="text-xs text-green-700 mt-3">{tp('aiAssistantForm.saved')}</p>
      )}

      {state.error && (
        <p className="text-xs text-red-600 mt-3">{state.error}</p>
      )}
    </form>
  )
}
