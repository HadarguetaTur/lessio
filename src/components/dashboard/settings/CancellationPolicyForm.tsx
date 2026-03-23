'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'

type ActionState = { error: string } | { success: true } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface CancellationPolicyFormProps {
  action: FormAction
  defaultValues: {
    notice_hours_full: number
    notice_hours_partial: number
    partial_charge_percent: number
  }
  readOnly?: boolean
}

export function CancellationPolicyForm({
  action,
  defaultValues,
  readOnly = false,
}: CancellationPolicyFormProps) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-6 max-w-lg">
      {'error' in (state ?? {}) && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-md">
          {(state as { error: string }).error}
        </div>
      )}
      {'success' in (state ?? {}) && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-md">
          המדיניות נשמרה בהצלחה
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
        <div className="space-y-1">
          <label htmlFor="notice_hours_full" className="block text-sm font-medium text-gray-700">
            שעות הודעה מוקדמת לביטול ללא חיוב
          </label>
          <p className="text-xs text-gray-500">ביטול מעל X שעות לפני השיעור — אין חיוב</p>
          <input
            id="notice_hours_full"
            name="notice_hours_full"
            type="number"
            min="1"
            step="1"
            defaultValue={defaultValues.notice_hours_full}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="notice_hours_partial" className="block text-sm font-medium text-gray-700">
            שעות הודעה מוקדמת לחיוב חלקי
          </label>
          <p className="text-xs text-gray-500">
            ביטול בין X לבין הסף המלא — חיוב חלקי. ביטול פחות מ-X שעות — חיוב מלא
          </p>
          <input
            id="notice_hours_partial"
            name="notice_hours_partial"
            type="number"
            min="0"
            step="1"
            defaultValue={defaultValues.notice_hours_partial}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="partial_charge_percent" className="block text-sm font-medium text-gray-700">
            אחוז חיוב חלקי (%)
          </label>
          <p className="text-xs text-gray-500">אחוז מסכום השיעור שייגבה בחיוב חלקי (0–100)</p>
          <input
            id="partial_charge_percent"
            name="partial_charge_percent"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={defaultValues.partial_charge_percent}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 space-y-1">
        <p className="font-medium text-gray-700">כיצד פועלת המדיניות:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>ביטול מעל {defaultValues.notice_hours_full} שעות לפני השיעור — אין חיוב</li>
          <li>
            ביטול בין {defaultValues.notice_hours_partial} ל-{defaultValues.notice_hours_full} שעות — חיוב{' '}
            {defaultValues.partial_charge_percent}%
          </li>
          <li>ביטול פחות מ-{defaultValues.notice_hours_partial} שעות לפני — חיוב מלא</li>
        </ul>
      </div>

      {!readOnly && (
        <Button type="submit" disabled={pending}>
          {pending ? 'שומר...' : 'שמירת מדיניות'}
        </Button>
      )}
    </form>
  )
}
