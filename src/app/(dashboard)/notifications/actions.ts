'use server'

/**
 * Server actions for in-app notification center — Sprint 25 Story 4.
 */

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
  type InAppNotification,
} from '@/lib/notifications'

export async function fetchNotificationsAction(): Promise<{
  notifications: InAppNotification[]
  unreadCount: number
}> {
  const { profileId, orgId } = await getSession()
  const [notifications, unreadCount] = await Promise.all([
    getNotifications(profileId, orgId, { limit: 30 }),
    getUnreadCount(profileId, orgId),
  ])
  return { notifications, unreadCount }
}

export async function fetchUnreadCountAction(): Promise<number> {
  const { profileId, orgId } = await getSession()
  return getUnreadCount(profileId, orgId)
}

export async function markAsReadAction(notificationId: string): Promise<void> {
  const session = await getSession()
  requireMutation(session)
  await markAsRead(notificationId)
}

export async function markAllReadAction(): Promise<void> {
  const session = await getSession()
  const { profileId, orgId } = session
  requireMutation(session)
  await markAllRead(profileId, orgId)
  revalidatePath('/')
}
