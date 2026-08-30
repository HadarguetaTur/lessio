'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { saveExamPolicySettings, type ExamPolicyActionState } from './actions'

interface ExamPolicyFormProps {
  defaultMode: 'notify' | 'approve' | 'auto'
  defaultQuotaBump: number
  defaultOfferBooster: boolean
  quotaEnforced: boolean
}

const initialState: ExamPolicyActionState = { error: null }

const MODES = ['notify', 'approve', 'auto'] as const

export function ExamPolicyForm({
  defaultMode,
  defaultQuotaBump,
  defaultOfferBooster,
  quotaEnforced,
}: ExamPolicyFormProps) {
  const t = useTranslations('settings.exams')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveExamPolicySettings, initialState)
  const [mode, setMode] = useState<'notify' | 'approve' | 'auto'>(defaultMode)

  const bumpRelevant = mode !== 'notify'

  return (
    <form action={formAction} className="space-y-6">
      {/* Mode */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-900 mb-1">{t('modeLabel')}</legend>
        {MODES.map((m) => (
          <label key={m} className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="exam_policy_mode"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
              className="mt-1 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="block">
              <span className="block text-sm text-gray-900">{t(`modes.${m}`)}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {t(`modes.${m}Hint`)}
              </span>
            </span>
          </label>
        ))}
        {!quotaEnforced && mode !== 'notify' && (
          <p className="text-xs text-amber-700 mt-1">{t('quotaDisabledWarning')}</p>
        )}
      </fieldset>

      <hr className="border-gray-100" />

      {/* Bump size */}
      <div className={bumpRelevant ? undefined : 'opacity-50'}>
        <label htmlFor="exam_quota_bump" className="block text-sm font-medium text-gray-900">
          {t('bumpLabel')}
        </label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">{t('bumpHint')}</p>
        <input
          id="exam_quota_bump"
          name="exam_quota_bump"
          type="number"
          min={1}
          max={5}
          defaultValue={defaultQuotaBump}
          disabled={!bumpRelevant}
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        {/* Disabled inputs are not submitted — keep the stored value intact. */}
        {!bumpRelevant && <input type="hidden" name="exam_quota_bump" value={defaultQuotaBump} />}
      </div>

      <hr className="border-gray-100" />

      {/* Booster offer */}
      <label className="flex items-start justify-between gap-4 cursor-pointer">
        <span className="block">
          <span className="block text-sm font-medium text-gray-900">{t('boosterLabel')}</span>
          <span className="block text-xs text-muted-foreground mt-0.5">{t('boosterHint')}</span>
        </span>
        <input
          type="checkbox"
          name="exam_offer_booster"
          defaultChecked={defaultOfferBooster}
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
