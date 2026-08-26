'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { disconnectReceiptAction } from './actions'

type ChangeState = { error?: string }
const initialState: ChangeState = {}

/**
 * Returns the org to the unanswered state so the chooser asks again.
 * Reuses disconnectReceiptAction because clearing the answer and clearing any
 * stored credentials must always happen together — a mode without its
 * credentials is exactly the inconsistency this screen exists to prevent.
 */
export function ChangeReceiptModeButton() {
  const t = useTranslations('settings.receiptMode')
  const [state, formAction, isPending] = useActionState<ChangeState, FormData>(
    async () => await disconnectReceiptAction(),
    initialState
  )

  return (
    <form action={formAction}>
      {state.error && <p className="text-sm text-red-600 mb-2">{state.error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {t('change')}
      </button>
    </form>
  )
}
