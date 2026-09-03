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
