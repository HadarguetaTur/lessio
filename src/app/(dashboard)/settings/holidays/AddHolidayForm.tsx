'use client'

import { useActionState } from 'react'
import { addHoliday, type HolidayActionState } from './actions'

const initialState: HolidayActionState = null

export function AddHolidayForm() {
  const [state, formAction, isPending] = useActionState(addHoliday, initialState)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">הוסף חג או חופשה</h2>
      <form action={formAction} className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="date" className="block text-xs font-medium text-gray-700 mb-1">
            תאריך
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 min-w-40">
          <label htmlFor="name" className="block text-xs font-medium text-gray-700 mb-1">
            שם החג / החופשה
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={100}
            placeholder="לדוגמה: ראש השנה"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'שומר…' : 'הוסף'}
        </button>
      </form>
      {state?.error && (
        <p className="mt-3 text-sm text-red-600">{state.error}</p>
      )}
    </div>
  )
}
