'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { DAY_NAMES } from '@/lib/availability/constants'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

export function AddAvailabilityForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="bg-white rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">הוסף חלון זמינות</h2>

      {state?.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded-md mb-3">
          {state.error}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700">
            יום
          </label>
          <select
            id="day_of_week"
            name="day_of_week"
            required
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {DAY_NAMES.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
        </div>

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

        <Button type="submit" disabled={pending} className="mb-0">
          {pending ? 'שומר...' : 'הוסף'}
        </Button>
      </div>
    </form>
  )
}
