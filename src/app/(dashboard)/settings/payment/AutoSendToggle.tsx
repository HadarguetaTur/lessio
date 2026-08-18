'use client'

/**
 * Toggle for auto_send_payment_request org setting.
 * Submits immediately on change via a form action.
 * Per /docs/sprint-9-scope.md § Story 6.
 */

import { useActionState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { saveAutoSendSetting, type PaymentActionResult } from './actions'

const initialState: PaymentActionResult = { error: null }

export function AutoSendToggle({ defaultChecked }: { defaultChecked: boolean }) {
  const tp = useTranslations('settings')
  const t = useTranslations('settings.payment')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveAutoSendSetting, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  function handleChange() {
    formRef.current?.requestSubmit()
  }

  return (
    <form ref={formRef} action={formAction}>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          name="auto_send_payment_request"
          defaultChecked={defaultChecked}
          onChange={handleChange}
          disabled={isPending}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
        />
        <span className="text-sm text-gray-700">
          {t('autoSend')}
        </span>
        {isPending && (
          <span className="text-xs text-gray-400">{tCommon('actions.save')}…</span>
        )}
      </label>
      {state.error && (
        <p className="mt-2 text-xs text-red-600">{state.error}</p>
      )}
      <p className="mt-1 text-xs text-gray-400">{tp('autoSendToggle.hint')}</p>
    </form>
  )
}
