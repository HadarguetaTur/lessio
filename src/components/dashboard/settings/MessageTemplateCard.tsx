'use client'

/**
 * MessageTemplateCard — editable card for a single WhatsApp message template.
 * Per /docs/sprint-16-scope.md § Story 3.
 *
 * Features:
 * - Textarea pre-filled with custom or system-default body
 * - Variable hint showing available {{vars}} for this type
 * - Live preview using client-side substituteVars (no server round-trip)
 * - Save and Reset actions
 */

import React, { useActionState, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { saveTemplateAction, resetTemplateAction, type ActionState } from '@/app/(dashboard)/settings/message-templates/actions'
import { substituteVars } from '@/lib/whatsapp/templates'
import type { MessageTemplateType } from '@/lib/whatsapp/templates'
import type { AppLocale } from '@/lib/i18n/locale'

interface MessageTemplateCardProps {
  type: MessageTemplateType
  locale: AppLocale
  label: string
  defaultBody: string
  customBody: string | null
  variables: string[]
  previewVars: Record<string, string>
}

const initialState: ActionState = { error: null }

export function MessageTemplateCard({
  type,
  locale,
  label,
  defaultBody,
  customBody,
  variables,
  previewVars,
}: MessageTemplateCardProps) {
  const t = useTranslations('settings.messageTemplates')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveTemplateAction, initialState)
  const [body, setBody] = useState(customBody ?? defaultBody)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const isCustom = customBody !== null

  // Reflect optimistic reset: if saved body becomes null, revert textarea to default
  useEffect(() => {
    if (!isCustom && body !== defaultBody) setBody(defaultBody)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustom])

  async function handleReset() {
    setResetPending(true)
    setResetError(null)
    const result = await resetTemplateAction(type, locale)
    setResetPending(false)
    if (result.error) {
      setResetError(result.error)
    }
  }

  const preview = substituteVars(body, previewVars)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        {isCustom && (
          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5 font-medium">
            {t('saved')}
          </span>
        )}
      </div>

      {/* Variable hint */}
      {variables.length > 0 && (
        <div className="text-xs text-gray-500">
          <span className="font-medium">{t('variables')}: </span>
          {variables.map((v, i) => (
            <span key={v}>
              <code className="bg-gray-100 text-gray-700 px-1 rounded font-mono">{`{{${v}}}`}</code>
              {i < variables.length - 1 && <span className="text-gray-400">, </span>}
            </span>
          ))}
        </div>
      )}

      {/* Save form */}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="locale" value={locale} />
        <textarea
          name="body_template"
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          dir={locale === 'he' ? 'rtl' : 'ltr'}
          className={`w-full text-sm border rounded-md px-3 py-2 resize-y font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            customBody === null ? 'text-gray-400 border-gray-200 bg-gray-50' : 'text-gray-900 border-gray-300 bg-white'
          }`}
          placeholder={defaultBody}
        />

        {state.error && (
          <p className="text-xs text-red-600">{state.error}</p>
        )}
        {state.success && (
          <p className="text-xs text-green-600">{t('saved')}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? `${tCommon('actions.save')}…` : tCommon('actions.save')}
          </button>

          {isCustom && (
            <button
              type="button"
              onClick={handleReset}
              disabled={resetPending}
              className="px-4 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {resetPending ? `${t('reset')}…` : t('reset')}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPreview(p => !p)}
            className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors underline"
          >
            {showPreview ? tCommon('actions.close') : t('preview')}
          </button>
        </div>

        {resetError && (
          <p className="text-xs text-red-600">{resetError}</p>
        )}
      </form>

      {/* Live preview */}
      {showPreview && (
        <div className="border border-gray-200 rounded-md bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">{t('preview')}:</p>
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed" dir={locale === 'he' ? 'rtl' : 'ltr'}>
            {preview}
          </pre>
        </div>
      )}
    </div>
  )
}
