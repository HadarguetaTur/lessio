'use client'

import { useActionState, useState } from 'react'
import { LessonStatus } from '@/lib/lessons'

// 'cancelled' is excluded — cancellation must go through CancelLessonForm (DEV-58)
// to ensure the policy engine and charge calculation are applied.
const STATUS_LABELS: Partial<Record<LessonStatus, string>> = {
  scheduled: 'מתוכנן',
  completed: 'הושלם',
  no_show: 'לא הגיע',
}

interface Props {
  currentStatus: LessonStatus
  action: (
    prevState: { error: string | null; chargeAlert?: string },
    formData: FormData
  ) => Promise<{ error: string | null; chargeAlert?: string }>
}

export function LessonStatusForm({ currentStatus, action }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null, chargeAlert: undefined })
  const [selected, setSelected] = useState<LessonStatus>(currentStatus)

  if (currentStatus === 'cancelled') {
    return (
      <p className="text-sm text-gray-400 italic">שיעור בוטל — לא ניתן לשנות סטטוס.</p>
    )
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
          שנה סטטוס
        </label>
        <select
          id="status"
          name="status"
          value={selected}
          onChange={(e) => setSelected(e.target.value as LessonStatus)}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {(Object.keys(STATUS_LABELS) as LessonStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {selected === 'cancelled' && (
        <div>
          <label htmlFor="cancel_reason" className="block text-sm font-medium text-gray-700 mb-1">
            סיבת ביטול (אופציונלי)
          </label>
          <textarea
            id="cancel_reason"
            name="cancel_reason"
            rows={2}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="הזן סיבת ביטול..."
          />
        </div>
      )}

      {state.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      {state.error === null && !pending && selected !== currentStatus && (
        <p className="text-sm text-green-600">הסטטוס עודכן בהצלחה.</p>
      )}

      {state.chargeAlert && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-md">
          ⚠️ {state.chargeAlert}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || selected === currentStatus}
        className="w-full bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? 'מעדכן...' : 'עדכן סטטוס'}
      </button>
    </form>
  )
}
