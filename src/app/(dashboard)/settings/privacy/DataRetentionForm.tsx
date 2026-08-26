'use client'

import { useActionState } from 'react'
import type { DataRetentionState } from './actions'
import { useTranslations } from 'next-intl'

interface Props {
  currentDays: number | null
  action: (prev: DataRetentionState, formData: FormData) => Promise<DataRetentionState>
}

// Labels come from settings.dataRetention — `365` is the product default.
const OPTIONS = ['90', '180', '365', 'never'] as const

function currentValueFromDays(days: number | null): string {
  if (days === null) return 'never'
  if (days === 90) return '90'
  if (days === 180) return '180'
  return '365'
}

export function DataRetentionForm({ currentDays, action }: Props) {
  const tp = useTranslations('settings')
  const [state, formAction, isPending] = useActionState(action, { error: null })

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <label htmlFor="retention_days" className="block text-sm font-medium text-foreground mb-1.5">{tp('dataRetention.label')}</label>
        <p className="text-xs text-muted-foreground mb-2">{tp('dataRetention.hint')}</p>
        <select
          id="retention_days"
          name="retention_days"
          defaultValue={currentValueFromDays(currentDays)}
          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
        >
          {OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o === 'never'
                ? tp('dataRetention.never')
                : o === '365'
                  ? tp('dataRetention.daysDefault', { n: o })
                  : tp('dataRetention.days', { n: o })}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-700">{tp('dataRetention.saved')}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? tp('dataRetention.saving') : tp('dataRetention.save')}
      </button>
    </form>
  )
}
