import { forbidden } from 'next/navigation'
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

const TYPE_LABELS: Record<string, string> = {
  lesson_reminder: 'תזכורת שיעור',
  payment_reminder: 'תזכורת תשלום',
}

const STATUS_LABELS: Record<string, string> = {
  sent: 'נשלח',
  failed: 'נכשל',
}

export default async function RemindersSettingsPage() {
  const { orgId, role } = await getSession()

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
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">הגדרות תזכורות</h1>
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
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          לוג שליחות אחרונות
        </h2>

        {!logs || logs.length === 0 ? (
          <p className="text-sm text-gray-400">לא נשלחו תזכורות עדיין.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    תאריך
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    סוג
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    ישות
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    סטטוס
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {fmtDateTime(log.sent_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {TYPE_LABELS[log.type] ?? log.type}
                    </td>
                    <td
                      className="px-4 py-3 text-gray-500 font-mono text-xs max-w-[120px] truncate"
                      title={log.entity_id}
                    >
                      {log.entity_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      {log.status === 'sent' ? (
                        <span className="text-green-600 font-medium">
                          {STATUS_LABELS.sent}
                        </span>
                      ) : (
                        <span
                          className="text-red-500 font-medium"
                          title={log.error_message ?? undefined}
                        >
                          {STATUS_LABELS.failed}
                          {log.error_message && (
                            <span className="text-xs font-normal text-gray-400 block">
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
        )}
      </div>
    </div>
  )
}
