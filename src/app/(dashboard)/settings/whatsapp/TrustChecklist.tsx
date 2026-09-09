'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { refreshWhatsAppHealth, toggleVerificationChecklistItem, type TrustActionResult } from './trust-actions'
import {
  VERIFICATION_CHECKLIST_IDS,
  type VerificationChecklistId,
} from '@/lib/whatsapp/verificationChecklist'

const initial: TrustActionResult = { error: null }

/** Ticks a preparation step. One form per row keeps each toggle a plain POST. */
export function TrustChecklist({ ticked }: { ticked: Partial<Record<VerificationChecklistId, string>> }) {
  const t = useTranslations('settings.whatsappTrust')
  const [state, formAction, isPending] = useActionState(toggleVerificationChecklistItem, initial)

  return (
    <div className="space-y-2">
      {VERIFICATION_CHECKLIST_IDS.map((id) => {
        const done = Boolean(ticked[id])
        return (
          <form key={id} action={formAction} className="flex items-start gap-2">
            <input type="hidden" name="item" value={id} />
            <input type="hidden" name="checked" value={done ? 'off' : 'on'} />
            <button
              type="submit"
              disabled={isPending}
              aria-pressed={done}
              className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                done ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
              } disabled:opacity-60`}
              aria-label={t(`checklist.${id}.title`)}
            >
              {done && (
                <svg viewBox="0 0 16 16" className="h-4 w-4 text-white" aria-hidden="true">
                  <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              )}
            </button>
            <div>
              <p className={`text-sm ${done ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                {t(`checklist.${id}.title`)}
              </p>
              <p className="text-xs text-muted-foreground">{t(`checklist.${id}.hint`)}</p>
            </div>
          </form>
        )
      })}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </div>
  )
}

export function RefreshHealthButton({ checkedAtLabel }: { checkedAtLabel: string | null }) {
  const t = useTranslations('settings.whatsappTrust')
  const [state, formAction, isPending] = useActionState(refreshWhatsAppHealth, initial)

  return (
    <form action={formAction} className="flex items-center gap-3">
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-60"
      >
        <RefreshCw size={14} className={isPending ? 'animate-spin' : ''} />
        {t('refresh')}
      </button>
      {checkedAtLabel && (
        <span className="text-xs text-muted-foreground">{t('lastChecked', { when: checkedAtLabel })}</span>
      )}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  )
}
