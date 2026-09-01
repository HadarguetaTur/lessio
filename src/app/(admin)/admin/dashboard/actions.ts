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
  await requirePlatformSession()
  await markAsRead(notificationId)
  revalidatePath('/admin/dashboard')
}
