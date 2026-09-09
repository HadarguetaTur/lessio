/**
 * The only writer of whatsapp_messages — the conversation transcript behind
 * /messages/whatsapp.
 *
 * Every function here is fire-and-forget, the same contract conversationLog.ts
 * keeps: a transcript is a nice-to-have, answering the parent is not. A failed
 * insert is logged and swallowed, never thrown, so no logging bug can take the
 * bot down or lose a send that already reached Meta.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getWaLogContext, type WaLogOrigin } from './logContext'

export type WaMessageKind =
  | 'text'
  | 'template'
  | 'interactive'
  | 'cta_url'
  | 'media'
  | 'unsupported'

export type SenderRole = 'parent' | 'student' | 'teacher' | 'staff' | 'unknown'

/** Records a message the business received. */
export async function logInboundMessage(params: {
  orgId: string
  phone: string
  body: string
  kind?: WaMessageKind
  waMessageId?: string
}): Promise<void> {
  const { orgId, phone, body, kind = 'text', waMessageId } = params
  const db = createServiceRoleClient()

  const { error } = await db.from('whatsapp_messages').insert({
    organization_id: orgId,
    phone,
    direction: 'in',
    kind,
    body,
    wa_message_id: waMessageId ?? null,
    status: 'received',
  })

  if (error) {
    console.error('[whatsapp/messageLog] inbound insert failed', { orgId, error: error.message })
  }
}

/** Records a message the business sent. */
export async function logOutboundMessage(params: {
  orgId: string
  phone: string
  body: string
  origin: WaLogOrigin
  kind?: WaMessageKind
  sentByProfileId?: string
  waMessageId?: string
}): Promise<void> {
  const { orgId, phone, body, origin, kind = 'text', sentByProfileId, waMessageId } = params
  const db = createServiceRoleClient()

  const { error } = await db.from('whatsapp_messages').insert({
    organization_id: orgId,
    phone,
    direction: 'out',
    origin,
    kind,
    body,
    sent_by_profile_id: sentByProfileId ?? null,
    wa_message_id: waMessageId ?? null,
    status: 'sent',
  })

  if (error) {
    console.error('[whatsapp/messageLog] outbound insert failed', { orgId, origin, error: error.message })
  }
}

/**
 * Appends a successful send to the transcript, if the caller declared who it is
 * (see ./logContext.ts). This is what the low-level senders call.
 *
 * Silent when no context is in scope, and never awaited: a transcript must not
 * delay or fail a message Meta has already accepted.
 */
export function recordOutboundSend(res: Response, body: string, kind: WaMessageKind): void {
  const ctx = getWaLogContext()
  // An unbound context means the conversation is not known yet (the webhook
  // declines an org before it resolves one, say) — better no row than a guess.
  if (!ctx?.orgId || !ctx.phone) return
  const { orgId, phone } = ctx

  void (async () => {
    // Meta returns the id it assigned; every sender used to discard it. Kept so
    // an outbound row can later be matched to a delivery-status callback.
    const waMessageId = await res
      .clone()
      .json()
      .then((json: { messages?: { id?: string }[] }) => json?.messages?.[0]?.id)
      .catch(() => undefined)

    await logOutboundMessage({
      orgId,
      phone,
      origin: ctx.origin,
      sentByProfileId: ctx.sentByProfileId,
      body,
      kind,
      waMessageId,
    })
  })()
}

/**
 * Fills in who an inbound message came from.
 *
 * The row is written before resolveSender runs, so that a message is recorded
 * even when identification fails or the org is out of service. This second pass
 * adds the identity once it is known. It is an enrichment: the conversation
 * list falls back to a phone lookup for rows this never reached.
 */
export async function attachInboundSender(params: {
  orgId: string
  waMessageId: string
  senderRole: SenderRole
  parentId?: string | null
}): Promise<void> {
  const { orgId, waMessageId, senderRole, parentId } = params
  const db = createServiceRoleClient()

  const { error } = await db
    .from('whatsapp_messages')
    .update({ sender_role: senderRole, parent_id: parentId ?? null })
    .eq('organization_id', orgId)
    .eq('wa_message_id', waMessageId)
    .eq('direction', 'in')

  if (error) {
    console.error('[whatsapp/messageLog] sender attach failed', { orgId, error: error.message })
  }
}

export type OutboundDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

/**
 * Meta's statuses arrive out of order (a `read` can land before its
 * `delivered`), so a transition only ever moves forward. `failed` outranks
 * everything: a message Meta gave up on is failed whatever it reported before.
 */
const STATUS_RANK: Record<OutboundDeliveryStatus, number> = {
  sent: 0,
  delivered: 1,
  read: 2,
  failed: 3,
}

/** Statuses a row may currently hold and still accept `next`. */
function statusesBelow(next: OutboundDeliveryStatus): OutboundDeliveryStatus[] {
  return (Object.keys(STATUS_RANK) as OutboundDeliveryStatus[]).filter(
    (s) => STATUS_RANK[s] < STATUS_RANK[next]
  )
}

/**
 * Applies a delivery status Meta reported for a message we sent.
 *
 * Returns true when a row was advanced, false when nothing matched — the
 * message predates the transcript, or the status arrived already superseded.
 */
export async function applyDeliveryStatus(params: {
  orgId: string
  waMessageId: string
  status: OutboundDeliveryStatus
  errorCode?: number | null
  errorMessage?: string | null
}): Promise<boolean> {
  const { orgId, waMessageId, status, errorCode, errorMessage } = params
  const eligible = statusesBelow(status)
  if (eligible.length === 0) return false

  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('whatsapp_messages')
    .update({
      status,
      status_updated_at: new Date().toISOString(),
      error_code: status === 'failed' ? (errorCode ?? null) : null,
      error_message: status === 'failed' ? (errorMessage ?? null) : null,
    })
    .eq('organization_id', orgId)
    .eq('wa_message_id', waMessageId)
    .eq('direction', 'out')
    .in('status', eligible)
    .select('id')

  if (error) {
    console.error('[whatsapp/messageLog] delivery status update failed', {
      orgId,
      status,
      error: error.message,
    })
    return false
  }

  return (data?.length ?? 0) > 0
}
