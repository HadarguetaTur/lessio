'use client'

/**
 * Re-registers Lessio's message templates on the org's connected WABA.
 *
 * Registration already runs automatically at Embedded Signup, but fire-and-forget:
 * this is the visible retry, and the only place an org can see which templates
 * Meta accepted. It is also the on-camera demonstration of the
 * whatsapp_business_management permission for Meta's App Review screencast —
 * see docs/meta-app-review-submission.md.
 */

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle, AlertCircle } from 'lucide-react'
import { registerTemplates, type RegisterTemplatesResult } from './actions'

const initialState: RegisterTemplatesResult = { error: null, registered: [], failed: [] }

export function RegisterTemplatesButton() {
  const t = useTranslations('settings.whatsapp')
  const [state, formAction, isPending] = useActionState(registerTemplates, initialState)

  const hasRun = state.registered.length > 0 || state.failed.length > 0

  return (
    <form action={formAction}>
      <h2 className="text-sm font-semibold text-gray-700 mb-1">{t('templates.title')}</h2>
      <p className="text-xs text-muted-foreground mb-3">{t('templates.description')}</p>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {isPending ? `${t('templates.action')}…` : t('templates.action')}
      </button>

      {state.error && (
        <p className="text-sm text-red-600 mt-3">{t(`templates.errors.${state.error}`)}</p>
      )}

      {hasRun && (
        <div className="mt-3 space-y-2">
          {state.registered.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-sm text-green-700">
                <CheckCircle size={16} />
                {t('templates.registered', { count: state.registered.length })}
              </p>
              <ul className="mt-1 ps-6 text-xs text-muted-foreground font-mono space-y-0.5">
                {state.registered.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          {state.failed.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-sm text-red-600">
                <AlertCircle size={16} />
                {t('templates.failed', { count: state.failed.length })}
              </p>
              <ul className="mt-1 ps-6 text-xs text-red-600 space-y-0.5">
                {state.failed.map((f) => (
                  <li key={f.name}>
                    <span className="font-mono">{f.name}</span> — {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  )
}
