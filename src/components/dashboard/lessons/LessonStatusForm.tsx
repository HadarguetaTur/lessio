'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { LessonStatus } from '@/lib/lessons/types'

interface Props {
  currentStatus: LessonStatus
  action: (
    prevState: { error: string | null; chargeAlert?: string },
    formData: FormData
  ) => Promise<{ error: string | null; chargeAlert?: string }>
}

export function LessonStatusForm({ currentStatus, action }: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const [state, formAction, pending] = useActionState(action, { error: null, chargeAlert: undefined })
  const [selected, setSelected] = useState<LessonStatus>(currentStatus)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // 'cancelled' is excluded — cancellation must go through CancelLessonForm (DEV-58)
  const STATUS_LABELS: Partial<Record<LessonStatus, string>> = {
    scheduled: tCommon('status.scheduled'),
    completed: tCommon('status.completed'),
    no_show: tCommon('status.no_show'),
  }

  if (currentStatus === 'cancelled') {
    return (
      <p className="text-sm text-muted-foreground italic">{t('cancelledStatus')}</p>
    )
  }

  const showSuccess = hasSubmitted && state.error === null && !pending && !state.chargeAlert

  return (
    <form action={formAction} onSubmit={() => setHasSubmitted(true)} className="space-y-3">
      <div>
        <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
          {t('changeStatus')}
        </label>
        <select
          id="status"
          name="status"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value as LessonStatus)
            setHasSubmitted(false)
          }}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {(Object.keys(STATUS_LABELS) as LessonStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-md">
          {state.error}
        </div>
      )}

      {showSuccess && (
        <p className="text-sm text-green-700" role="status">{t('statusUpdated')}</p>
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
        {pending ? t('updating') : t('updateStatus')}
      </button>
    </form>
  )
}
