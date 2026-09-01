'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type { LessonType } from '@/lib/lessons/types'
import { saveBillingPolicySettings, type BillingPolicyActionState } from './actions'

interface BillingPolicyFormProps {
  defaultCoveredTypes: LessonType[]
  defaultBillingMode: 'monthly' | 'per_lesson'
  defaultCycleStartDay: number
  defaultDueDays: number
}

const initialState: BillingPolicyActionState = { error: null }

const LESSON_TYPES: readonly LessonType[] = ['individual', 'pair', 'group', 'custom']

export function BillingPolicyForm({
  defaultCoveredTypes,
  defaultBillingMode,
  defaultCycleStartDay,
  defaultDueDays,
}: BillingPolicyFormProps) {
  const t = useTranslations('settings.billingPolicy')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveBillingPolicySettings, initialState)
  const [covered, setCovered] = useState<LessonType[]>(defaultCoveredTypes)

  const toggle = (type: LessonType, checked: boolean) =>
    setCovered((prev) => (checked ? [...prev, type] : prev.filter((t) => t !== type)))

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-900">{t('modeLabel')}</legend>
        <p className="text-xs text-muted-foreground">{t('modeHint')}</p>
        {(['monthly', 'per_lesson'] as const).map((mode) => (
          <label key={mode} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <input
              type="radio"
              name="billing_mode"
              value={mode}
              defaultChecked={defaultBillingMode === mode}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-medium">{t(`modes.${mode}.label`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`modes.${mode}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          <span>{t('cycleStartDay')}</span>
          <input
            type="number"
            name="billing_cycle_start_day"
            min={1}
            max={28}
            defaultValue={defaultCycleStartDay}
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
          />
          <span className="block text-xs font-normal text-muted-foreground">{t('cycleStartHint')}</span>
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>{t('dueDays')}</span>
          <input
            type="number"
            name="billing_due_days"
            min={0}
            max={90}
            defaultValue={defaultDueDays}
            className="block w-full rounded-md border border-input bg-background px-3 py-2"
          />
          <span className="block text-xs font-normal text-muted-foreground">{t('dueDaysHint')}</span>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900 mb-1">{t('coverageLabel')}</legend>
        <p className="text-xs text-muted-foreground mb-3">{t('coverageHint')}</p>

        {LESSON_TYPES.map((type) => (
          <label key={type} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="covered_lesson_types"
              value={type}
              checked={covered.includes(type)}
              onChange={(e) => toggle(type, e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="block">
              <span className="block text-sm text-gray-900">{t(`lessonTypes.${type}`)}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {t(`lessonTypeHints.${type}`)}
              </span>
            </span>
          </label>
        ))}

        {covered.length === 0 && (
          <p className="text-xs text-amber-700 mt-2">{t('noneCoveredHint')}</p>
        )}
      </fieldset>

      <p className="text-xs text-muted-foreground">{t('retroactiveHint')}</p>

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
