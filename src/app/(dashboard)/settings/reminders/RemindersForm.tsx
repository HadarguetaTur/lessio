'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Loader2, AlertTriangle } from 'lucide-react'
import { saveReminderSettings, type ReminderActionState } from './actions'
import { resolveRemindersToggleState } from './toggleState'

interface RemindersFormProps {
  defaultEnabled: boolean
  /**
   * Read-only here. The lesson-reminder timing lives on
   * organizations.automation_lesson_reminder_hours and is owned by
   * /settings/whatsapp (sprint-31-scope.md § 72). This page used to render its
   * own select over the legacy lesson_reminder_hours column, which the cron
   * never reads — so saving it changed nothing while reporting success.
   */
  lessonHours: number
  defaultPaymentDays: number
  defaultEmailNotifications: Record<string, boolean>
  parentsWithEmail: number
  /** No connected number means nothing on this page can actually be delivered. */
  hasWhatsApp: boolean
}

const initialState: ReminderActionState = { error: null }

const EMAIL_NOTIFICATION_KEYS = [
  'lesson_reminder',
  'payment_reminder',
  'homework_assignment',
  'receipt',
  'homework_graded',
  'progress_report',
] as const

export function RemindersForm({
  defaultEnabled,
  lessonHours,
  defaultPaymentDays,
  defaultEmailNotifications,
  parentsWithEmail,
  hasWhatsApp,
}: RemindersFormProps) {
  const tp = useTranslations('settings')
  const t = useTranslations('settings.reminders')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(
    saveReminderSettings,
    initialState
  )

  // Everything below the master switch only has meaning while reminders are on,
  // so the switch drives their disabled state. Disabled controls are not
  // submitted, which would silently wipe the stored values — the hidden mirrors
  // below keep the saved settings intact while the switch is off.
  const [remindersEnabled, setRemindersEnabled] = useState(defaultEnabled)
  const [paymentDays, setPaymentDays] = useState(String(defaultPaymentDays))
  const [emailPrefs, setEmailPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      EMAIL_NOTIFICATION_KEYS.map((k) => [k, defaultEmailNotifications[k] ?? false])
    )
  )
  const dependentsOff = !remindersEnabled

  // The switch reflects intent; this reflects reality. They are not the same
  // thing while the org has no WhatsApp number, and the page used to show only
  // the first one.
  const { onButNotSending } = resolveRemindersToggleState({
    hasWhatsApp,
    currentlyEnabled: remindersEnabled,
  })

  return (
    <form action={formAction} className="space-y-6">
      {/* Master switch */}
      <label className="flex items-start justify-between gap-4">
        <span className="block">
          <span className="block text-sm font-medium text-gray-900">{t('masterLabel')}</span>
          <span className="block text-xs text-muted-foreground mt-0.5">{tp('remindersPage.masterHint')}</span>
        </span>
        <input
          type="checkbox"
          name="reminders_enabled"
          checked={remindersEnabled}
          onChange={(e) => setRemindersEnabled(e.target.checked)}
          className={`mt-0.5 h-4 w-4 rounded border-gray-300 focus:ring-blue-500 ${
            onButNotSending ? 'text-amber-500' : 'text-blue-600'
          }`}
        />
      </label>

      {onButNotSending && (
        <p className="-mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {t('onButNotSending')}{' '}
            <Link href="/settings/whatsapp" className="font-medium underline underline-offset-2">
              {t('connectWhatsAppLink')}
            </Link>
          </span>
        </p>
      )}

      <hr className="border-gray-100" />

      {/* Lesson reminder timing — shown, not edited. The owning control is on
          /settings/whatsapp; a second editable copy here is what made this
          setting silently do nothing. */}
      <div className={dependentsOff ? 'opacity-50' : undefined}>
        <p className="block text-sm font-medium text-gray-900 mb-1">{t('hoursBeforeLesson')}</p>
        <p className="text-xs text-muted-foreground mb-2">{tp('remindersPage.lessonHoursHint')}</p>
        <p className="text-sm text-gray-900">
          {tp('remindersPage.lessonHoursValue', { h: lessonHours })}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {tp('remindersPage.lessonHoursManagedElsewhere')}{' '}
          <Link
            href="/settings/whatsapp"
            className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
          >
            {tp('remindersPage.lessonHoursChangeLink')}
          </Link>
        </p>
      </div>

      {/* Payment reminder days */}
      <div className={dependentsOff ? 'opacity-50' : undefined}>
        <label
          htmlFor="payment_reminder_days"
          className="block text-sm font-medium text-gray-900 mb-1"
        >
          {t('daysAfterInvoice')}
        </label>
        <p className="text-xs text-muted-foreground mb-2">{tp('remindersPage.paymentDaysHint')}</p>
        <input
          id="payment_reminder_days"
          type="number"
          name="payment_reminder_days"
          value={paymentDays}
          onChange={(e) => setPaymentDays(e.target.value)}
          disabled={dependentsOff}
          min={1}
          max={30}
          className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm disabled:cursor-not-allowed"
        />
        <p className="text-xs text-muted-foreground mt-1">{tp('remindersPage.daysRange')}</p>
      </div>

      {/* Email notification toggles — Sprint 25 */}
      <hr className="border-gray-100" />
      <div className={dependentsOff ? 'opacity-50' : undefined}>
        <p className="text-sm font-medium text-gray-900 mb-1">{t('emailNotifications')}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {t('emailDescription')} ({parentsWithEmail} {t('parentsWithEmail')})
        </p>
        <div className="space-y-2">
          {EMAIL_NOTIFICATION_KEYS.map((key) => (
            <label key={key} className="flex items-center gap-3">
              <input
                type="checkbox"
                name={`email_${key}`}
                checked={emailPrefs[key] ?? false}
                onChange={(e) =>
                  setEmailPrefs((prev) => ({ ...prev, [key]: e.target.checked }))
                }
                disabled={dependentsOff}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-gray-700">{t(`emailTypes.${key}`)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Disabled controls submit nothing; mirror their values so turning the
          master switch off saves the switch without erasing everything else. */}
      {dependentsOff && (
        <>
          <input type="hidden" name="payment_reminder_days" value={paymentDays} />
          {EMAIL_NOTIFICATION_KEYS.filter((key) => emailPrefs[key]).map((key) => (
            <input key={key} type="hidden" name={`email_${key}`} value="on" />
          ))}
        </>
      )}

      {dependentsOff && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {tp('remindersPage.offWarning')}
        </p>
      )}

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state.success && !state.error && (
        <p className="text-sm text-green-700">{tp('remindersPage.saved')}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {tCommon('actions.save')}
      </button>
    </form>
  )
}
