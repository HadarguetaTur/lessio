'use client'

import { useActionState } from 'react'
import type { DataRetentionState } from './actions'

interface Props {
  currentDays: number | null
  action: (prev: DataRetentionState, formData: FormData) => Promise<DataRetentionState>
}

const OPTIONS = [
  { value: '90', label: '90 יום' },
  { value: '180', label: '180 יום' },
  { value: '365', label: '365 יום (ברירת מחדל)' },
  { value: 'never', label: 'לעולם לא (שמירה ללא הגבלה)' },
]

function currentValueFromDays(days: number | null): string {
  if (days === null) return 'never'
  if (days === 90) return '90'
  if (days === 180) return '180'
  return '365'
}

export function DataRetentionForm({ currentDays, action }: Props) {
  const [state, formAction, isPending] = useActionState(action, { error: null })

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          תקופת שמירת נתוני פעילות
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          נתוני שיחות WhatsApp ויומן AI יאונימוזו לאחר תקופה זו.
        </p>
        <select
          name="retention_days"
          defaultValue={currentValueFromDays(currentDays)}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-600">ההגדרות נשמרו בהצלחה</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'שומר...' : 'שמור'}
      </button>
    </form>
  )
}
