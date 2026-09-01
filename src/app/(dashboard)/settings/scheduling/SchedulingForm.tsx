'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { saveSchedulingSettings, type SchedulingActionState } from './actions'

interface SchedulingFormProps {
  defaultBreakMinutes: number
  defaultNoticeHours: number
  defaultTailPromptEnabled: boolean
  /** How many teachers set their own break, so the owner knows this is a default. */
  teachersWithOwnBreak: number
}

const initialState: SchedulingActionState = { error: null }

export function SchedulingForm({
  defaultBreakMinutes,
  defaultNoticeHours,
  defaultTailPromptEnabled,
  teachersWithOwnBreak,
}: SchedulingFormProps) {
  const t = useTranslations('settings.scheduling')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveSchedulingSettings, initialState)

  return (
    <form action={formAction} className="space-y-6">
      {/* Default break */}
      <div>
        <label htmlFor="break_duration_minutes" className="block text-sm font-medium text-gray-900">
          {t('breakLabel')}
        </label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">{t('breakHint')}</p>
        <div className="flex items-center gap-2">
          <input
            id="break_duration_minutes"
            name="break_duration_minutes"
            type="number"
            min={0}
            max={120}
            step={5}
            defaultValue={defaultBreakMinutes}
            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <span className="text-sm text-muted-foreground">{t('minutes')}</span>
        </div>
        {teachersWithOwnBreak > 0 && (
          <p className="text-xs text-amber-700 mt-2">
            {t('overriddenByTeachers', { count: teachersWithOwnBreak })}
          </p>
        )}
      </div>

      <hr className="border-gray-100" />

      {/* Minimum booking notice */}
      <div>
        <label htmlFor="min_booking_notice_hours" className="block text-sm font-medium text-gray-900">
          {t('noticeLabel')}
        </label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">{t('noticeHint')}</p>
        <div className="flex items-center gap-2">
          <input
            id="min_booking_notice_hours"
            name="min_booking_notice_hours"
            type="number"
            min={0}
            max={168}
            defaultValue={defaultNoticeHours}
            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <span className="text-sm text-muted-foreground">{t('hours')}</span>
        </div>
      </div>

      <hr className="border-gray-100" />

      {/* Leftover-tail prompt */}
      <label className="flex items-start justify-between gap-4 cursor-pointer">
        <span className="block">
          <span className="block text-sm font-medium text-gray-900">{t('tailPromptLabel')}</span>
          <span className="block text-xs text-muted-foreground mt-0.5">{t('tailPromptHint')}</span>
        </span>
        <input
          type="checkbox"
          name="tail_prompt_enabled"
          defaultChecked={defaultTailPromptEnabled}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{t('saved')}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending && <Loader2 size={14} className="animate-spin" />}
        {tCommon('actions.save')}
      </button>
    </form>
  )
}
