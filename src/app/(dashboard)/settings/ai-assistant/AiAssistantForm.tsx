'use client'

/**
 * Client form for toggling AI assistant on/off.
 * Per /docs/sprint-19-scope.md § Story 3.
 */

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { saveAiAssistantSettings, type AiAssistantActionState } from './actions'

interface Props {
  defaultEnabled: boolean
  isConfigured: boolean
}

const initialState: AiAssistantActionState = { error: null }

export function AiAssistantForm({ defaultEnabled, isConfigured }: Props) {
  const t = useTranslations('settings.aiAssistant')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveAiAssistantSettings, initialState)
  const canToggle = isConfigured || defaultEnabled

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
          <p className="text-xs text-gray-500 mt-1 max-w-sm">
            כשמופעל, הודעות שלא מזוהות כפקודה ידועה (ביטול / יתרה / לוח זמנים) יענו אוטומטית
            על-ידי AI על בסיס המידע בחשבון. מוגבל ל-3 תגובות ל-24 שעות לכל מספר טלפון.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
          <input
            type="checkbox"
            name="ai_assistant_enabled"
            defaultChecked={defaultEnabled}
            disabled={!canToggle}
            className="sr-only peer"
            onChange={(e) => {
              // Auto-submit on toggle change
              ;(e.target.form as HTMLFormElement | null)?.requestSubmit()
            }}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
        </label>
      </div>

      {isPending && (
        <p className="text-xs text-gray-400 mt-3">{tCommon('actions.save')}…</p>
      )}

      {state.success && (
        <p className="text-xs text-green-600 mt-3">ההגדרות נשמרו בהצלחה.</p>
      )}

      {state.error && (
        <p className="text-xs text-red-500 mt-3">{state.error}</p>
      )}
    </form>
  )
}
