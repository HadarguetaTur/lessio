'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('settings.cancellationPolicy')
  const [state, formAction, pending] = useActionState(action, null)

  // The server already rejects an out-of-range percentage, but the browser's
  // own `max="100"` bubble fired first and silently swallowed the submit — and
  // that bubble is written in the *browser's* language, so a Hebrew RTL screen
  // showed "Value must be less than or equal to 100." or nothing at all.
  // noValidate hands the checks to us so every message is in the app's language
  // and lands in the same red box as the server's.
  const [clientError, setClientError] = useState<string | null>(null)

  function validate(form: HTMLFormElement): string | null {
    const num = (name: string) =>
      Number((form.elements.namedItem(name) as HTMLInputElement).value)
    const full = num('notice_hours_full')
    const partial = num('notice_hours_partial')
    const percent = num('partial_charge_percent')

    if (!Number.isFinite(full) || full < 1) return t('errors.fullHoursPositive')
    if (!Number.isFinite(partial) || partial < 0) return t('errors.partialHoursPositive')
    if (partial >= full) return t('errors.partialLessThanFull')
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return t('errors.percentRange')
    return null
  }

  const shownError = clientError ?? ('error' in (state ?? {}) ? (state as { error: string }).error : null)

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(e) => {
        const problem = validate(e.currentTarget)
        setClientError(problem)
        if (problem) e.preventDefault()
      }}
      className="space-y-6 max-w-lg"
    >
      {shownError && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-md">
          {shownError}
        </div>
      )}
      {!clientError && 'success' in (state ?? {}) && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-md">
          {t('saved')}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
        <div className="space-y-1">
          <label htmlFor="notice_hours_full" className="block text-sm font-medium text-gray-700">
            {t('noticeHoursFull')}
          </label>
          <p className="text-xs text-muted-foreground">{t('noticeHoursFullHint')}</p>
          <input
            id="notice_hours_full"
            name="notice_hours_full"
            type="number"
            min="1"
            step="1"
            defaultValue={defaultValues.notice_hours_full}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-muted-foreground"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="notice_hours_partial" className="block text-sm font-medium text-gray-700">
            {t('noticeHoursPartial')}
          </label>
          <p className="text-xs text-muted-foreground">{t('noticeHoursPartialHint')}</p>
          <input
            id="notice_hours_partial"
            name="notice_hours_partial"
            type="number"
            min="0"
            step="1"
            defaultValue={defaultValues.notice_hours_partial}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-muted-foreground"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="partial_charge_percent" className="block text-sm font-medium text-gray-700">
            {t('partialChargePercent')}
          </label>
          <p className="text-xs text-muted-foreground">{t('partialChargePercentHint')}</p>
          <input
            id="partial_charge_percent"
            name="partial_charge_percent"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={defaultValues.partial_charge_percent}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-muted-foreground"
          />
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 space-y-1">
        <p className="font-medium text-gray-700">{t('howItWorks')}</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>{t('ruleNoCharge', { hours: defaultValues.notice_hours_full })}</li>
          <li>{t('rulePartial', { partialHours: defaultValues.notice_hours_partial, fullHours: defaultValues.notice_hours_full, percent: defaultValues.partial_charge_percent })}</li>
          <li>{t('ruleFull', { hours: defaultValues.notice_hours_partial })}</li>
        </ul>
      </div>

      {!readOnly && (
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : t('saveButton')}
        </Button>
      )}
    </form>
  )
}
