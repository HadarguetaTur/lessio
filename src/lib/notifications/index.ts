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
  | 'portal_message'
  | 'invoice_cancelled'
  | 'webhook_unroutable'
  | 'day_off_requested'
  | 'day_off_decided'
  // Support (Sprint 32). The first two are platform-level (superadmin,
  // organization_id IS NULL); the last two go to the org that raised the ticket.
  | 'support_ticket_new'
  | 'support_ticket_activity'
  | 'support_ticket_reply'
  | 'support_ticket_resolved'
  // Recurring-bug detection (Sprint 32 M3). `dev_issue_new` is platform-level
  // and written by the error-monitor Edge Function, which inserts the row
  // directly — Deno cannot import this module, so its shape is mirrored there.
  | 'dev_issue_new'
  | 'dev_issue_fixed'

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
 * Notify all active superadmins with a platform-level notification
 * (organization_id IS NULL — Sprint 31 Story 4b). Fire-and-forget.
 */
export async function notifySuperadmins(
  type: NotificationType,
  title: string,
  body?: string,
  actionUrl?: string
): Promise<void> {
  try {
    const db = createServiceRoleClient()
    const { data: superadmins, error } = await db
      .from('profiles')
      .select('id')
      .eq('role', 'superadmin')
      .eq('is_active', true)

    if (error) {
      console.error('[notifications] Failed to resolve superadmins', { error: error.message })
      return
    }

    if (!superadmins || superadmins.length === 0) return

    const { error: insertError } = await db.from('in_app_notifications').insert(
      superadmins.map((p) => ({
        organization_id: null,
        recipient_profile_id: p.id,
        type,
        title,
        body: body ?? null,
        action_url: actionUrl ?? null,
      }))
    )

    if (insertError) {
      console.error('[notifications] Failed to notify superadmins', { type, error: insertError.message })
    }
  } catch (err) {
    console.error('[notifications] Unexpected error notifying superadmins', { type, err })
  }
}

/**
 * Fetch platform-level notifications (organization_id IS NULL) for a superadmin.
 */
export async function getSuperadminNotifications(
  profileId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {}
): Promise<InAppNotification[]> {
  const db = createServiceRoleClient()
  let query = db
    .from('in_app_notifications')
    .select('id, type, title, body, action_url, read_at, created_at')
    .is('organization_id', null)
    .eq('recipient_profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50)

  if (opts.unreadOnly) {
    query = query.is('read_at', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('[notifications] Failed to fetch superadmin notifications', { profileId, error: error.message })
    return []
  }

  return (data ?? []) as InAppNotification[]
}

/**
 * True when an unread platform-level notification of this type whose body
 * contains `bodyContains` was created in the last `withinHours` hours.
 * Used to throttle repeat alerts (e.g. a disconnected org emitting hundreds of
 * unroutable webhook messages per day).
 */
export async function hasRecentUnreadSuperadminNotification(
  type: NotificationType,
  bodyContains: string,
  withinHours: number
): Promise<boolean> {
  const db = createServiceRoleClient()
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString()

  const { count, error } = await db
    .from('in_app_notifications')
    .select('id', { count: 'exact', head: true })
    .is('organization_id', null)
    .eq('type', type)
    .is('read_at', null)
    .gt('created_at', since)
    .like('body', `%${bodyContains}%`)

  if (error) {
    console.error('[notifications] Failed to check recent superadmin notifications', { type, error: error.message })
    return false
  }

  return (count ?? 0) > 0
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
