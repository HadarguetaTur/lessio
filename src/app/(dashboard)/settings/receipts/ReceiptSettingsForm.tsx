'use client'

import { useActionState } from 'react'
import { saveReceiptConfigAction, type ReceiptActionState } from './actions'

const initialState: ReceiptActionState = { success: false }

export function ReceiptSettingsForm() {
  const [state, formAction, isPending] = useActionState(saveReceiptConfigAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="receipt-id" className="block text-sm font-medium text-gray-700 mb-1">
          API ID
        </label>
        <input
          id="receipt-id"
          name="id"
          type="text"
          required
          autoComplete="off"
          placeholder="מזהה ה-API מלוח הבקרה של חשבוניות ירוקות"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="receipt-secret" className="block text-sm font-medium text-gray-700 mb-1">
          Secret
        </label>
        <input
          id="receipt-secret"
          name="secret"
          type="password"
          required
          autoComplete="off"
          placeholder="הסיסמה הסודית מלוח הבקרה של חשבוניות ירוקות"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'מתחבר…' : 'שמור וחבר'}
      </button>
    </form>
  )
}
