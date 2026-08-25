'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { LessonStatus } from '@/lib/lessons/types'
import type { TeacherOutcomeResult } from '@/app/(dashboard)/teacher/schedule/[id]/actions'

interface Props {
  currentStatus: LessonStatus
  action: (
    prevState: TeacherOutcomeResult,
    formData: FormData
  ) => Promise<TeacherOutcomeResult>
}

export function TeacherLessonOutcomeForm({ currentStatus, action }: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const [state, formAction, pending] = useActionState(action, { error: null })
  const [selected, setSelected] = useState<'completed' | 'no_show'>(
    currentStatus === 'completed' || currentStatus === 'no_show' ? currentStatus : 'completed'
  )
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const OUTCOME_LABELS: Record<'completed' | 'no_show', string> = {
    completed: tCommon('status.completed'),
    no_show: tCommon('status.no_show'),
  }

  if (currentStatus === 'cancelled') {
    return (
      <p className="text-sm text-muted-foreground italic">{t('cancelledStatus')}</p>
    )
  }

  function handleSubmit() {
    setHasSubmitted(true)
  }

  const showSuccess = hasSubmitted && !pending && state.error === null && !state.chargeAlert

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="outcome" className="block text-sm font-medium text-gray-700 mb-1">
          {t('outcomeUpdate')}
        </label>
        <select
          id="outcome"
          name="status"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value as 'completed' | 'no_show')
            setHasSubmitted(false)
          }}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {(Object.keys(OUTCOME_LABELS) as Array<'completed' | 'no_show'>).map((s) => (
            <option key={s} value={s}>
              {OUTCOME_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">{state.error}</p>
      )}

      {showSuccess && (
        <p className="text-sm text-green-700" role="status">{t('statusUpdated')}</p>
      )}

      {state.chargeAlert && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-md" role="status">
          ⚠️ {state.chargeAlert}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || currentStatus === selected}
        className="w-full bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? t('updating') : t('updateOutcome')}
      </button>
    </form>
  )
}
