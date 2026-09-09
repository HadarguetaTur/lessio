'use server'

import { clearPortalSessionCookie, getPortalSession } from '@/lib/portal/session'
import { createDeletionRequest } from '@/lib/superadmin/dataDeletion'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

/** `error` is a key under the portal.gdpr namespace, translated by the client. */
export type DeletionRequestState = { error: 'noPhone' | 'error' | null; success?: boolean }

/**
 * Ends the portal session on this device.
 *
 * The portal's login model is a phone number, and in this product a family
 * phone is routinely shared or handed around — a parent signs in on a
 * partner's handset, or on the one the child uses for homework. The session
 * cookie lasts seven days and until now there was no way to end it:
 * clearPortalSessionCookie existed but had no callers anywhere in the
 * codebase, so the only exit was clearing site data.
 *
 * Deliberately unconditional. Logging out is the one action that must work
 * even when the cookie is already invalid, expired, or names another org —
 * refusing to clear a cookie because it looks wrong is exactly backwards.
 * redirect() signals by throwing, so it stays outside any try/catch.
 */
export async function portalLogoutAction(orgId: string): Promise<void> {
  await clearPortalSessionCookie()
  redirect(`/portal/${orgId}/login`)
}

/**
 * Inserts a GDPR data deletion request for the current portal session's phone number.
 * Per /docs/sprint-23-scope.md § Story 1a.
 */
/**
 * The parent's own consent to marketing messages.
 *
 * Recorded with source 'portal' so the evidence on file says the parent chose
 * it themselves rather than the business attesting on their behalf. Turning it
 * off writes marketing_opted_out_at and never touches opted_out_at, so lesson
 * reminders and payment requests keep working.
 */
export async function setMarketingOptInAction(
  orgId: string,
  optIn: boolean
): Promise<{ error: string | null }> {
  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }

  const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
  const now = new Date().toISOString()

  const { error } = await createServiceRoleClient()
    .from('parents')
    .update(
      optIn
        ? { marketing_opt_in_at: now, marketing_opt_in_source: 'portal', marketing_opted_out_at: null }
        : { marketing_opted_out_at: now, marketing_opt_in_at: null }
    )
    .eq('id', session.parentId)
    .eq('organization_id', orgId)

  if (error) {
    console.error('[portal/marketing] update failed', { orgId, error: error.message })
    return { error: 'error' }
  }

  revalidatePath(`/portal/${orgId}/home`)
  return { error: null }
}

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
    return { error: 'noPhone' }
  }

  try {
    await createDeletionRequest({ orgId, requesterPhone: parent.phone })
    return { error: null, success: true }
  } catch (err) {
    console.error('[portal/deletion] createDeletionRequest failed', { orgId, err })
    return { error: 'error' }
  }
}
