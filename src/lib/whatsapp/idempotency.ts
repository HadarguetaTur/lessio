import { createServiceRoleClient } from '@/lib/supabase/service-role'

function isDuplicateInsertError(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

const RATE_LIMIT_MAX_MESSAGES = 30
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000

/**
 * Sliding-window rate limit: true when the phone has sent 30+ messages to this
 * org in the last 5 minutes. Counts claimed rows in whatsapp_processed_messages,
 * so checking BEFORE claimIncomingMessage means dropped messages insert no row
 * and the window slides naturally.
 *
 * Fails open on query errors — availability over strictness for a paying org's
 * parents. Per /docs/sprint-31-scope.md § Story 4a.
 */
export async function isRateLimited(
  organizationId: string,
  phone: string
): Promise<boolean> {
  const db = createServiceRoleClient()
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()

  const { count, error } = await db
    .from('whatsapp_processed_messages')
    .select('message_id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('phone', phone)
    .gt('created_at', since)

  if (error) {
    console.warn('[whatsapp/idempotency] Rate limit check failed — failing open', {
      organizationId,
      error: error.message,
    })
    return false
  }

  return (count ?? 0) >= RATE_LIMIT_MAX_MESSAGES
}

/**
 * Claims an inbound WhatsApp message for processing.
 * Duplicate `message_id` values for the same org are treated as already handled.
 */
export async function claimIncomingMessage(
  organizationId: string,
  messageId: string,
  phone: string
): Promise<boolean> {
  const db = createServiceRoleClient()
  const { error } = await db.from('whatsapp_processed_messages').insert({
    organization_id: organizationId,
    message_id: messageId,
    phone,
  })

  if (!error) {
    return true
  }

  if (isDuplicateInsertError(error)) {
    return false
  }

  throw new Error(`Failed to claim incoming WhatsApp message: ${error.message}`)
}

/**
 * Releases a previously claimed message when processing fails before completion,
 * allowing Meta retries to re-enter the handler.
 */
export async function releaseIncomingMessageClaim(
  organizationId: string,
  messageId: string
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('whatsapp_processed_messages')
    .delete()
    .eq('organization_id', organizationId)
    .eq('message_id', messageId)

  if (error) {
    console.error('[whatsapp/idempotency] Failed to release message claim', {
      organizationId,
      messageId,
      error,
    })
  }
}
