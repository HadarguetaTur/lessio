'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { saveReminderSettings, type ReminderActionState } from './actions'

interface RemindersFormProps {
  defaultEnabled: boolean
  defaultLessonHours: number
  defaultPaymentDays: number
  defaultEmailNotifications: Record<string, boolean>
  parentsWithEmail: number
}

const LESSON_HOUR_OPTIONS = [2, 4, 12, 24, 48]

const initialState: ReminderActionState = { error: null }

const EMAIL_NOTIFICATION_TYPES = [
  { key: 'lesson_reminder', label: 'תזכורת שיעור' },
  { key: 'payment_reminder', label: 'תזכורת תשלום' },
  { key: 'homework_assignment', label: 'שיעורי בית חדשים' },
  { key: 'receipt', label: 'קבלה על תשלום' },
  { key: 'homework_graded', label: 'ציון שיעורי בית' },
]

export function RemindersForm({
  defaultEnabled,
  defaultLessonHours,
  defaultPaymentDays,
  defaultEmailNotifications,
  parentsWithEmail,
}: RemindersFormProps) {
  const t = useTranslations('settings.reminders')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(
    saveReminderSettings,
    initialState
  )

  return (
    <form action={formAction} className="space-y-6">
      {/* Master switch */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900">{t('lessonReminder')}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            כאשר מכובה — לא ישלחו תזכורות אוטומטיות כלל לארגון זה
          </p>
        </div>
        <input
          type="checkbox"
          name="reminders_enabled"
          defaultChecked={defaultEnabled}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </div>

      <hr className="border-gray-100" />

      {/* Lesson reminder hours */}
      <div>
        <label
          htmlFor="lesson_reminder_hours"
          className="block text-sm font-medium text-gray-900 mb-1"
        >
          {t('hoursBeforeLesson')}
        </label>
        <p className="text-xs text-gray-500 mb-2">
          ההורה יקבל הודעת WhatsApp X שעות לפני תחילת השיעור.
          לדוגמה: &quot;תזכורת: יש לך שיעור מחר עם ישראל ישראלי בשעה 16:00.&quot;
        </p>
        <select
          id="lesson_reminder_hours"
          name="lesson_reminder_hours"
          defaultValue={defaultLessonHours}
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        >
          {LESSON_HOUR_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h} שעות לפני
            </option>
          ))}
        </select>
      </div>

      {/* Payment reminder days */}
      <div>
        <label
          htmlFor="payment_reminder_days"
          className="block text-sm font-medium text-gray-900 mb-1"
        >
          {t('daysAfterInvoice')}
        </label>
        <p className="text-xs text-gray-500 mb-2">
          חיוב פתוח עם קישור תשלום שלא שולם אחרי X ימים יקבל תזכורת אחת.
          לדוגמה: &quot;תזכורת: יש לך חיוב פתוח בסך ₪200. לתשלום: [קישור]&quot;
        </p>
        <input
          id="payment_reminder_days"
          type="number"
          name="payment_reminder_days"
          defaultValue={defaultPaymentDays}
          min={1}
          max={30}
          className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        />
        <p className="text-xs text-gray-400 mt-1">בין 1 ל-30 ימים</p>
      </div>

      {/* Email notification toggles — Sprint 25 */}
      <hr className="border-gray-100" />
      <div>
        <p className="text-sm font-medium text-gray-900 mb-1">{t('emailNotifications')}</p>
        <p className="text-xs text-gray-500 mb-3">
          {t('emailDescription')} ({parentsWithEmail} {t('parentsWithEmail')})
        </p>
        <div className="space-y-2">
          {EMAIL_NOTIFICATION_TYPES.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3">
              <input
                type="checkbox"
                name={`email_${key}`}
                defaultChecked={defaultEmailNotifications[key] ?? false}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      {state.success && !state.error && (
        <p className="text-sm text-green-600">ההגדרות נשמרו בהצלחה</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? `${tCommon('actions.save')}…` : tCommon('actions.save')}
      </button>
    </form>
  )
}
