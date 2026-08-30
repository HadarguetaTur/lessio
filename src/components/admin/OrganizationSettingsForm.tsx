'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import type { ActionState } from '@/app/(admin)/admin/orgs/actions'
import type { OrgDetail } from '@/lib/superadmin/organizations'

const TIMEZONES = [
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
]

interface Props {
  org: OrgDetail
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
}

export function OrganizationSettingsForm({ org, action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null)
  const t = useTranslations('admin')

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 max-w-lg">
      <h2 className="text-sm font-semibold text-gray-800 mb-5">{t('orgs.settings.title')}</h2>

      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {state.error}
        </div>
      )}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="id" value={org.id} />

        <div>
          <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 mb-1">{t('orgs.table.name')}</label>
          <input
            id="org-name"
            name="name"
            defaultValue={org.name}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <label htmlFor="org-slug" className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <input
            id="org-slug"
            name="slug"
            defaultValue={org.slug}
            required
            dir="ltr"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <p className="text-xs text-muted-foreground mt-1">{t('orgs.settings.slugHint')}</p>
        </div>

        <div>
          <label htmlFor="org-timezone" className="block text-sm font-medium text-gray-700 mb-1">{t('orgs.fields.timezone')}</label>
          <select
            id="org-timezone"
            name="timezone"
            defaultValue={org.timezone}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="org-break-duration" className="block text-sm font-medium text-gray-700 mb-1">{t('orgs.settings.breakDuration')}</label>
            <input
              id="org-break-duration"
              name="break_duration_minutes"
              type="number"
              min={0}
              defaultValue={org.breakDurationMinutes}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label htmlFor="org-min-booking-notice" className="block text-sm font-medium text-gray-700 mb-1">{t('orgs.settings.minBookingNotice')}</label>
            <input
              id="org-min-booking-notice"
              name="min_booking_notice_hours"
              type="number"
              min={0}
              defaultValue={org.minBookingNoticeHours}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        <div>
          <label htmlFor="org-billing-mode" className="block text-sm font-medium text-gray-700 mb-1">{t('orgs.settings.billingMode')}</label>
          <select
            id="org-billing-mode"
            name="billing_mode"
            defaultValue={org.billingMode}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="monthly">{t('orgs.settings.billingMonthly')}</option>
            <option value="per_lesson">{t('orgs.settings.billingPerLesson')}</option>
          </select>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="bg-indigo-600 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? t('orgs.settings.saving') : t('orgs.settings.save')}
          </button>
          {state?.success && !isPending && (
            <span className="text-xs text-green-700">{t('orgs.settings.saved')}</span>
          )}
        </div>
      </form>
    </div>
  )
}
