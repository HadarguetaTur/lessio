import { getSuperadminNotifications, type InAppNotification } from '@/lib/notifications'
import { markPlatformNotificationRead } from '@/app/(admin)/admin/dashboard/actions'
import { DateTime } from 'luxon'
import { getTranslations } from 'next-intl/server'

interface Props {
  profileId: string
}

/**
 * Unread platform-level notifications (organization_id IS NULL) for the
 * current superadmin — e.g. WhatsApp webhooks arriving for an unknown
 * phone_number_id. Minimal list, no bell/badge (Sprint 31 Story 4b).
 */
export async function PlatformNotificationsList({ profileId }: Props) {
  const t = await getTranslations('admin')
  const notifications = await getSuperadminNotifications(profileId, { unreadOnly: true, limit: 20 })

  if (notifications.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-red-200 mb-6">
      <div className="px-5 py-4 border-b border-red-100">
        <h2 className="text-sm font-semibold text-red-700">{t('platformNotificationsTitle')}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{t('platformNotificationsSubtitle')}</p>
      </div>
      <ul className="divide-y divide-gray-50">
        {notifications.map((n) => (
          <NotificationRow key={n.id} notification={n} />
        ))}
      </ul>
    </div>
  )
}

async function NotificationRow({ notification }: { notification: InAppNotification }) {
  const t = await getTranslations('admin')
  const markRead = markPlatformNotificationRead.bind(null, notification.id)

  return (
    <li className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{notification.title}</p>
        {notification.body && (
          <p className="text-xs text-gray-500 mt-0.5 break-all">{notification.body}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          {DateTime.fromISO(notification.created_at).setZone('Asia/Jerusalem').toFormat('dd/MM/yyyy HH:mm')}
        </p>
      </div>
      <form action={markRead}>
        <button
          type="submit"
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
        >
          {t('markRead')}
        </button>
      </form>
    </li>
  )
}
