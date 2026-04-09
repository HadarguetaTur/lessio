import { forbidden } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { RemindersForm } from './RemindersForm'

/**
 * Reminder settings page — owner only.
 * Per /docs/sprint-12-scope.md § Story 2 + Story 6.
 *
 * Shows:
 *  1. Reminder configuration form (reminders_enabled, lesson_reminder_hours, payment_reminder_days)
 *  2. Last 20 notification_log entries for this org
 */

function fmtDateTime(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function RemindersSettingsPage() {
  const { orgId, role } = await getSession()
  const t = await getTranslations('settings.reminders')

  const TYPE_LABELS: Record<string, string> = {
    lesson_reminder: t('lessonReminder'),
    payment_reminder: t('paymentReminder'),
  }

  const STATUS_LABELS: Record<string, string> = {
    sent: 'נשלח',
    failed: 'נכשל',
  }

  if (role !== 'owner') {
    forbidden()
  }

  const db = createServiceRoleClient()

  const [{ data: org }, { data: logs }] = await Promise.all([
    db
      .from('organizations')
      .select('reminders_enabled, lesson_reminder_hours, payment_reminder_days')
      .eq('id', orgId)
      .single(),
    db
      .from('notification_log')
      .select('id, type, entity_id, sent_at, status, error_message')
      .eq('organization_id', orgId)
      .order('sent_at', { ascending: false })
      .limit(20),
  ])

  return (
    <div className="flex h-full min-h-0 w-full max-w-xl flex-col overflow-hidden">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('title')}</h1>
      <p className="text-sm text-gray-500 mb-8">
        הגדר תזכורות WhatsApp אוטומטיות להורים לפני שיעורים ועל חיובים פתוחים.
      </p>

      {/* Settings form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <RemindersForm
          defaultEnabled={org?.reminders_enabled ?? true}
          defaultLessonHours={org?.lesson_reminder_hours ?? 24}
          defaultPaymentDays={org?.payment_reminder_days ?? 7}
        />
      </div>

      {/* Notification log */}
      <div className="min-h-0 flex flex-1 flex-col">
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          {t('notificationLog')}
        </h2>

        {!logs || logs.length === 0 ? (
          <p className="text-sm text-gray-400">{t('noLog')}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="h-full overflow-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                    {t('logHeaders.sentAt')}
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                    {t('logHeaders.type')}
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                    ישות
                    </th>
                    <th className="sticky top-0 z-10 bg-gray-50 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-gray-500">
                    {t('logHeaders.recipient')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {fmtDateTime(log.sent_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {TYPE_LABELS[log.type] ?? log.type}
                      </td>
                      <td
                        className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-gray-500"
                        title={log.entity_id}
                      >
                        {log.entity_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3">
                        {log.status === 'sent' ? (
                          <span className="font-medium text-green-600">
                            {STATUS_LABELS.sent}
                          </span>
                        ) : (
                          <span
                            className="font-medium text-red-500"
                            title={log.error_message ?? undefined}
                          >
                            {STATUS_LABELS.failed}
                            {log.error_message && (
                              <span className="block text-xs font-normal text-gray-400">
                                {log.error_message.slice(0, 60)}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
