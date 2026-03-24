'use client'

import { useActionState, useState } from 'react'
import type { CancelLessonResult } from '@/app/(dashboard)/lessons/[id]/actions'

type FormAction = (
  prevState: CancelLessonResult,
  formData: FormData
) => Promise<CancelLessonResult>

interface Props {
  action: FormAction
}

export function CancelLessonForm({ action }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(action, { error: null })
  const [hasSubmitted, setHasSubmitted] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => {
          setHasSubmitted(false)
          setOpen(true)
        }}
        className="text-sm text-red-600 hover:text-red-800 underline underline-offset-2"
      >
        ביטול שיעור
      </button>
    )
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-5 space-y-4">
      <h3 className="text-sm font-semibold text-red-800">ביטול שיעור</h3>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      {state.chargeAlert && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-md">
          ⚠️ {state.chargeAlert}
        </div>
      )}

      {/* Success state — lesson cancelled */}
      {hasSubmitted && state.error === null && !pending && state.chargeAlert === undefined && (
        <p className="text-sm text-green-700" role="status">השיעור בוטל בהצלחה.</p>
      )}

      <form action={formAction} onSubmit={() => setHasSubmitted(true)} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="cancel_reason" className="block text-sm font-medium text-red-800">
            סיבת ביטול <span className="text-red-500">*</span>
          </label>
          <textarea
            id="cancel_reason"
            name="cancel_reason"
            rows={2}
            required
            placeholder="הזן סיבת ביטול..."
            className="w-full border border-red-200 rounded-md px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none bg-white"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="waive"
            value="true"
            className="rounded border-gray-300 text-red-600 focus:ring-red-400"
          />
          <span className="text-sm text-gray-700">ויתור על חיוב (לא יישלח חיוב לביטול זה)</span>
        </label>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? 'מבטל...' : 'אישור ביטול'}
          </button>
          <button
            type="button"
            onClick={() => {
              setHasSubmitted(false)
              setOpen(false)
            }}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            חזרה
          </button>
        </div>
      </form>
    </div>
  )
}
