/**
 * Send one subscription email to an org owner, at most once per key.
 *
 * `notification_log` (UNIQUE organization_id, type, entity_id) is the ledger:
 * the row is claimed with an INSERT *before* sending, so two cron runs racing
 * on the same key cannot both send. A send failure marks the row failed and
 * a later run may retry it — the ledger only stops duplicates of a success.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendPlatformEmail } from '@/lib/email'
import type { SaasEmail } from '@/lib/email/templates/saas'
import { getOwnerContact, type OwnerContact } from './ownerContact'

export type OwnerEmailLogType = 'saas_trial_reminder' | 'saas_lifecycle_email' | 'saas_dunning' | 'saas_renewal_reminder'

export type OwnerEmailOutcome = 'sent' | 'duplicate' | 'no_email' | 'failed'

export async function sendOwnerEmailOnce(params: {
  orgId: string
  logType: OwnerEmailLogType
  /** e.g. saas_trial:<sub>:T-7 — whatever makes a second send a duplicate. */
  dedupKey: string
  build: (owner: OwnerContact) => SaasEmail
}): Promise<OwnerEmailOutcome> {
  const db = createServiceRoleClient()

  // Claim first. A duplicate key means another run already owns this send.
  const { error: claimErr } = await db.from('notification_log').insert({
    organization_id: params.orgId,
    type: params.logType,
    entity_id: params.dedupKey,
    status: 'pending',
  })
  if (claimErr) {
    if (claimErr.code === '23505') {
      // Retry only a previous *failure*; a pending/sent row is somebody else's.
      const { data: retried } = await db
        .from('notification_log')
        .update({ status: 'pending', error_message: null })
        .eq('organization_id', params.orgId)
        .eq('type', params.logType)
        .eq('entity_id', params.dedupKey)
        .eq('status', 'failed')
        .select('id')
      if (!retried || retried.length === 0) return 'duplicate'
    } else {
      console.error('[saas/ownerNotify] ledger insert failed', { orgId: params.orgId, error: claimErr.message })
      return 'failed'
    }
  }

  const finish = async (status: 'sent' | 'failed', message?: string) => {
    await db
      .from('notification_log')
      .update({ status, error_message: message?.slice(0, 500) ?? null })
      .eq('organization_id', params.orgId)
      .eq('type', params.logType)
      .eq('entity_id', params.dedupKey)
  }

  const owner = await getOwnerContact(params.orgId)
  if (!owner?.email) {
    await finish('failed', 'owner has no email')
    return 'no_email'
  }

  const email = params.build(owner)
  const ok = await sendPlatformEmail({ to: owner.email, subject: email.subject, html: email.html })
  await finish(ok ? 'sent' : 'failed', ok ? undefined : 'provider rejected')
  return ok ? 'sent' : 'failed'
}
