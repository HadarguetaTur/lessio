'use client'

import { useActionState } from 'react'
import { disconnectReceiptAction } from './actions'

type DisconnectState = { error?: string }
const initialState: DisconnectState = {}

export function DisconnectReceiptButton() {
  const [state, formAction, isPending] = useActionState<DisconnectState, FormData>(
    async (_prev, _formData) => {
      return await disconnectReceiptAction()
    },
    initialState
  )

  return (
    <form action={formAction}>
      {state.error && (
        <p className="text-sm text-red-600 mb-2">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center px-3 py-1.5 rounded-md border border-red-300 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'מנתק…' : 'נתק ספק קבלות'}
      </button>
    </form>
  )
}
