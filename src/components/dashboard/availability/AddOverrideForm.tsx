'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

export function AddOverrideForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, null)
  const [type, setType] = useState<'block' | 'available'>('block')

  return (
    <form action={formAction} className="bg-white rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">הוסף חריג</h2>

      {state?.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded-md mb-3">
          {state.error}
        </div>
      )}

      {/* Hidden field for type */}
      <input type="hidden" name="type" value={type} />

      <div className="flex flex-wrap gap-3 items-end">
        {/* Date */}
        <div className="space-y-1">
          <label htmlFor="override_date" className="block text-sm font-medium text-gray-700">
            תאריך
          </label>
          <input
            id="override_date"
            name="override_date"
            type="date"
            required
            dir="ltr"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Type toggle */}
        <div className="space-y-1">
          <span className="block text-sm font-medium text-gray-700">סוג</span>
          <div className="flex border border-gray-300 rounded-md overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setType('block')}
              className={`px-3 py-2 transition-colors ${
                type === 'block'
                  ? 'bg-red-50 text-red-700 font-medium'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              חסום יום
            </button>
            <button
              type="button"
              onClick={() => setType('available')}
              className={`px-3 py-2 border-r border-gray-300 transition-colors ${
                type === 'available'
                  ? 'bg-green-50 text-green-700 font-medium'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              זמינות מיוחדת
            </button>
          </div>
        </div>

        {/* Time fields — only for available type */}
        {type === 'available' && (
          <>
            <div className="space-y-1">
              <label htmlFor="start_time" className="block text-sm font-medium text-gray-700">
                משעה
              </label>
              <input
                id="start_time"
                name="start_time"
                type="time"
                required
                dir="ltr"
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="end_time" className="block text-sm font-medium text-gray-700">
                עד שעה
              </label>
              <input
                id="end_time"
                name="end_time"
                type="time"
                required
                dir="ltr"
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {/* Reason */}
        <div className="space-y-1">
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
            סיבה (אופציונלי)
          </label>
          <input
            id="reason"
            name="reason"
            type="text"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-40"
          />
        </div>

        <Button type="submit" disabled={pending} className="mb-0">
          {pending ? 'שומר...' : 'הוסף'}
        </Button>
      </div>
    </form>
  )
}
