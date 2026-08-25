'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { disconnectPayment, type PaymentActionResult } from './actions'

const initialState: PaymentActionResult = { error: null }

export function DisconnectPaymentButton() {
  const t = useTranslations('settings.payment')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(disconnectPayment, initialState)

  return (
    <form action={formAction}>
      {state.error && (
        <p className="text-sm text-red-600 mb-2">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center px-3 py-1.5 rounded-md border border-red-300 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
      >
        {isPending ? `${tCommon('actions.disconnect')}…` : t('disconnect')}
      </button>
    </form>
  )
}
