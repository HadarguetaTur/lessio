'use server'

/**
 * Server actions for the superadmin platform dashboard.
 * Guarded by requirePlatformSession — superadmins are never in support mode,
 * so requireMutation does not apply here.
 */

import { revalidatePath } from 'next/cache'
import { requirePlatformSession } from '@/lib/superadmin/session'
import { markAsRead } from '@/lib/notifications'

export async function markPlatformNotificationRead(notificationId: string): Promise<void> {
  const session = await requirePlatformSession()
  // Platform notifications carry organization_id IS NULL; scoping to the recipient
  // keeps one superadmin from clearing another's feed.
  await markAsRead(notificationId, session.profileId, null)
  revalidatePath('/admin/dashboard')
}
