'use client'

import { useActionState } from 'react'
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

  return (
    <form action={formAction} className="space-y-6 max-w-lg">
      {'error' in (state ?? {}) && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-md">
          {(state as { error: string }).error}
        </div>
      )}
      {'success' in (state ?? {}) && (
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
