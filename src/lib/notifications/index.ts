/**
 * In-app notification center — Sprint 25 Story 4a.
 *
 * All access via service role (RLS deny-all on in_app_notifications).
 * Fire-and-forget — never throws, logs errors.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type NotificationType =
  | 'lesson_cancelled'
  | 'payment_received'
  | 'homework_submitted'
  | 'student_at_risk'
  | 'new_lead'
  | 'goal_achieved'

export interface CreateNotificationParams {
  orgId: string
  recipientProfileId: string
  type: NotificationType
  title: string
  body?: string
  actionUrl?: string
}

export interface InAppNotification {
  id: string
  type: NotificationType
  title: string
  body: string | null
  action_url: string | null
  read_at: string | null
  created_at: string
}

/**
 * Create a single in-app notification. Fire-and-forget — logs errors, never throws.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const db = createServiceRoleClient()
    const { error } = await db.from('in_app_notifications').insert({
      organization_id: params.orgId,
      recipient_profile_id: params.recipientProfileId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      action_url: params.actionUrl ?? null,
    })

    if (error) {
      console.error('[notifications] Failed to create notification', {
        orgId: params.orgId,
        type: params.type,
        error: error.message,
      })
    }
  } catch (err) {
    console.error('[notifications] Unexpected error creating notification', {
      orgId: params.orgId,
      type: params.type,
      err,
    })
  }
}

/**
 * Create the same notification for multiple recipients.
 */
export async function notifyMultiple(
  orgId: string,
  recipientProfileIds: string[],
  type: NotificationType,
  title: string,
  body?: string,
  actionUrl?: string
): Promise<void> {
  await Promise.all(
    recipientProfileIds.map((profileId) =>
      createNotification({ orgId, recipientProfileId: profileId, type, title, body, actionUrl })
    )
  )
}

/**
 * Fetch notifications for a given profile, newest first.
 */
export async function getNotifications(
  profileId: string,
  orgId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {}
): Promise<InAppNotification[]> {
  const db = createServiceRoleClient()
  let query = db
    .from('in_app_notifications')
    .select('id, type, title, body, action_url, read_at, created_at')
    .eq('organization_id', orgId)
    .eq('recipient_profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.unreadOnly) {
    query = query.is('read_at', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('[notifications] Failed to fetch notifications', { profileId, error: error.message })
    return []
  }

  return (data ?? []) as InAppNotification[]
}

/**
 * Count unread notifications for a profile.
 */
export async function getUnreadCount(profileId: string, orgId: string): Promise<number> {
  const db = createServiceRoleClient()
  const { count, error } = await db
    .from('in_app_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('recipient_profile_id', profileId)
    .is('read_at', null)

  if (error) {
    console.error('[notifications] Failed to count unread', { profileId, error: error.message })
    return 0
  }

  return count ?? 0
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId: string): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)

  if (error) {
    console.error('[notifications] Failed to mark as read', { notificationId, error: error.message })
  }
}

/**
 * Mark all notifications as read for a profile.
 */
export async function markAllRead(profileId: string, orgId: string): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('in_app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('recipient_profile_id', profileId)
    .is('read_at', null)

  if (error) {
    console.error('[notifications] Failed to mark all as read', { profileId, error: error.message })
  }
}

/**
 * Resolve profile IDs for owner + admin roles in an org.
 * Used to determine who receives org-wide notifications.
 */
export async function getOwnerAndAdminProfileIds(orgId: string): Promise<string[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('profiles')
    .select('id')
    .eq('organization_id', orgId)
    .in('role', ['owner', 'admin'])
    .eq('is_active', true)

  if (error) {
    console.error('[notifications] Failed to resolve owner/admin profiles', { orgId, error: error.message })
    return []
  }

  return (data ?? []).map((p) => p.id)
}

/**
 * Resolve the teacher's profile_id from their teacher record.
 */
export async function getTeacherProfileId(teacherId: string): Promise<string | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('teachers')
    .select('profile_id')
    .eq('id', teacherId)
    .single()

  if (error) {
    console.error('[notifications] Failed to resolve teacher profile', { teacherId, error: error.message })
    return null
  }

  return data?.profile_id ?? null
}
