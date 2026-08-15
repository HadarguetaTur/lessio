'use server'

/**
 * Server actions for the superadmin platform dashboard.
 * Guarded by requireSuperAdminSession — superadmins are never in support mode,
 * so requireMutation does not apply here.
 */

import { revalidatePath } from 'next/cache'
import { requireSuperAdminSession } from '@/lib/auth/session'
import { markAsRead } from '@/lib/notifications'

export async function markPlatformNotificationRead(notificationId: string): Promise<void> {
  await requireSuperAdminSession()
  await markAsRead(notificationId)
  revalidatePath('/admin/dashboard')
}
