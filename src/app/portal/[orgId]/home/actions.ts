'use server'

import { getPortalSession } from '@/lib/portal/session'
import { createDeletionRequest } from '@/lib/superadmin/dataDeletion'
import { redirect } from 'next/navigation'

export type DeletionRequestState = { error: string | null; success?: boolean }

/**
 * Inserts a GDPR data deletion request for the current portal session's phone number.
 * Per /docs/sprint-23-scope.md § Story 1a.
 */
export async function requestDeletionAction(
  orgId: string,
  _prev: DeletionRequestState
): Promise<DeletionRequestState> {
  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }

  // We need the parent's phone — look it up from the parent record
  const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
  const db = createServiceRoleClient()
  const { data: parent } = await db
    .from('parents')
    .select('phone')
    .eq('id', session.parentId)
    .single()

  if (!parent?.phone) {
    return { error: 'לא ניתן לאתר את מספר הטלפון שלך' }
  }

  try {
    await createDeletionRequest({ orgId, requesterPhone: parent.phone })
    return { error: null, success: true }
  } catch (err) {
    console.error('[portal/deletion] createDeletionRequest failed', { orgId, err })
    return { error: 'שגיאה בשליחת הבקשה. נסה שוב.' }
  }
}
