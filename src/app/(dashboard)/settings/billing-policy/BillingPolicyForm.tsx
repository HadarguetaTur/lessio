'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import type { LessonType } from '@/lib/lessons/types'
import { saveBillingPolicySettings, type BillingPolicyActionState } from './actions'

interface BillingPolicyFormProps {
  defaultCoveredTypes: LessonType[]
}

const initialState: BillingPolicyActionState = { error: null }

const LESSON_TYPES: readonly LessonType[] = ['individual', 'pair', 'group', 'custom']

export function BillingPolicyForm({ defaultCoveredTypes }: BillingPolicyFormProps) {
  const t = useTranslations('settings.billingPolicy')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveBillingPolicySettings, initialState)
  const [covered, setCovered] = useState<LessonType[]>(defaultCoveredTypes)

  const toggle = (type: LessonType, checked: boolean) =>
    setCovered((prev) => (checked ? [...prev, type] : prev.filter((t) => t !== type)))

  return (
    <form action={formAction} className="space-y-6">
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
