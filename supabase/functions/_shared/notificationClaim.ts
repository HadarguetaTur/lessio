/**
 * Claim-before-send for the reminder crons.
 *
 * The old pattern was SELECT notification_log → send → UPSERT. Two runs of the
 * same cron overlapping in time (a schedule registered twice, a retry, a deploy
 * mid-run) both saw no row, both sent, and the upsert then merged them into one
 * row — so the parent got two messages while the ledger showed one.
 *
 * Here the row is inserted as 'pending' BEFORE the send. The unique key
 * (organization_id, type, entity_id) makes the insert atomic: exactly one run
 * gets the row, every other run gets 23505 and stands down. After the send the
 * owner settles the row to 'sent' or 'failed'.
 *
 * Mirrors src/lib/saas/ownerNotify.ts (Node side of the same idea).
 */

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type ClaimOutcome = 'claimed' | 'duplicate' | 'error'

/** A 'pending' row older than this is a run that died mid-send; the next run may take it over. */
const STALE_PENDING_MS = 60 * 60 * 1000

export async function claimNotification(
  db: Db,
  params: { orgId: string; type: string; entityId: string }
): Promise<ClaimOutcome> {
  const { error: insertError } = await db.from('notification_log').insert({
    organization_id: params.orgId,
    type: params.type,
    entity_id: params.entityId,
    status: 'pending',
  })

  if (!insertError) return 'claimed'

  if (insertError.code !== '23505') {
    // Fail closed: a missed reminder beats a duplicate one.
    console.error('[notificationClaim] insert failed', {
      org_id: params.orgId,
      type: params.type,
      entity_id: params.entityId,
      error: insertError.message,
    })
    return 'error'
  }

  // A row exists. Take it over only if it is a previous failure (retry) or a
  // pending claim that never settled (the run died). A live pending row or a
  // sent row belongs to somebody else.
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString()
  const { data: retaken, error: updateError } = await db
    .from('notification_log')
    .update({ status: 'pending', error_message: null, sent_at: new Date().toISOString() })
    .eq('organization_id', params.orgId)
    .eq('type', params.type)
    .eq('entity_id', params.entityId)
    .or(`status.eq.failed,and(status.eq.pending,sent_at.lt.${staleBefore})`)
    .select('id')

  if (updateError) {
    console.error('[notificationClaim] retake failed', {
      org_id: params.orgId,
      type: params.type,
      entity_id: params.entityId,
      error: updateError.message,
    })
    return 'error'
  }

  return retaken && retaken.length > 0 ? 'claimed' : 'duplicate'
}

export async function settleNotification(
  db: Db,
  params: {
    orgId: string
    type: string
    entityId: string
    status: 'sent' | 'failed'
    errorMessage: string | null
  }
): Promise<void> {
  const { error } = await db
    .from('notification_log')
    .update({
      status: params.status,
      error_message: params.errorMessage,
      sent_at: new Date().toISOString(),
    })
    .eq('organization_id', params.orgId)
    .eq('type', params.type)
    .eq('entity_id', params.entityId)

  if (error) {
    console.error('[notificationClaim] settle failed', {
      org_id: params.orgId,
      type: params.type,
      entity_id: params.entityId,
      error: error.message,
    })
  }
}
