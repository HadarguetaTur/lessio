/**
 * Inbound reply -> classification -> prospect state -> lead + demo email.
 *
 * The acceptance path of the whole engine lives here. Order matters:
 *
 * 1. Log the message first, keyed on the transport's message id. A second
 *    fetch of the same reply hits the unique index and stops here — the
 *    poller overlaps its windows, and a reply must never be classified twice.
 * 2. Match a prospect. By from-address first (one prospect per email, so this
 *    is unambiguous); by thread id / In-Reply-To as a fallback for a reply
 *    sent from an alias. An unmatched reply is kept with
 *    classification 'unmatched', never dropped.
 * 3. Classify, move the prospect through the state table, then run the side
 *    effects the new state implies. The lead upsert and the demo email are
 *    each idempotent on their own, so a crash between them is recoverable by
 *    posting the reply again under a new id.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { classifyReply } from './classifyReply'
import { nextStatus } from './transitions'
import { addSuppression, isSuppressed, normalizeEmail } from './suppressions'
import { addLeadEvent, upsertLeadFromProspect } from './leads'
import { sendDemoEmailOnce, type DemoEmailOutcome } from './demoEmail'
import { scheduleFollowup } from './followups'
import { eraseProspectByEmail } from './unsubscribe'
import type { Prospect, ProspectStatus, ReplyClassification } from './types'

export interface IngestReplyInput {
  fromEmail: string
  subject?: string | null
  bodyText: string
  transportMessageId: string
  transportThreadId?: string | null
  inReplyTo?: string | null
  receivedAt?: string | null
  /** The reply's own RFC Message-ID; a follow-up quotes it to stay in-thread. */
  rfcMessageId?: string | null
  /** The outbound_mailboxes row whose inbox received it. */
  mailboxId?: string | null
}

export type IngestReplyResult =
  | { duplicate: true }
  /** The sender is on the do-not-email list. Nothing was stored. */
  | { duplicate: false; suppressed: true }
  | { duplicate: false; matched: false; classification: 'unmatched'; messageId: string }
  | {
      duplicate: false
      matched: true
      messageId: string
      prospectId: string
      classification: ReplyClassification
      status: ProspectStatus
      moved: boolean
      leadId?: string
      demoEmail?: DemoEmailOutcome
    }

export async function ingestReply(input: IngestReplyInput): Promise<IngestReplyResult> {
  const db = createServiceRoleClient()
  const fromEmail = normalizeEmail(input.fromEmail)

  // 0. Someone who asked out keeps nothing here, not even a message row. The
  //    poller overlaps its windows, so the reply that triggered the erase comes
  //    back around on the next run; storing it would re-create the address we
  //    just promised to delete.
  if (await isSuppressed(fromEmail)) return { duplicate: false, suppressed: true }

  // 1. Log first. The unique index is the idempotency key.
  const { data: inserted, error: insertErr } = await db
    .from('outbound_messages')
    .insert({
      prospect_id: null,
      direction: 'in',
      kind: 'reply',
      transport: 'gmail',
      mailbox_id: input.mailboxId ?? null,
      transport_message_id: input.transportMessageId,
      transport_thread_id: input.transportThreadId ?? null,
      in_reply_to: input.inReplyTo ?? null,
      rfc_message_id: input.rfcMessageId ?? null,
      from_email: fromEmail,
      subject: input.subject ?? null,
      body: input.bodyText.slice(0, 20_000),
      created_at: input.receivedAt ?? undefined,
    })
    .select('id')
    .single()
  if (insertErr) {
    if (insertErr.code === '23505') return { duplicate: true }
    throw new Error(`[outbound/ingest] message insert failed: ${insertErr.message}`)
  }
  const messageId = inserted.id as string

  // 2. Match.
  const prospect = await matchProspect(db, { fromEmail, threadId: input.transportThreadId, inReplyTo: input.inReplyTo })
  if (!prospect) {
    await db.from('outbound_messages').update({ classification: 'unmatched' }).eq('id', messageId)
    return { duplicate: false, matched: false, classification: 'unmatched', messageId }
  }

  // 3. Classify and move.
  const { classification, snippet } = classifyReply({ fromEmail, subject: input.subject, bodyText: input.bodyText })
  await db
    .from('outbound_messages')
    .update({ prospect_id: prospect.id, classification, body: snippet || input.bodyText.slice(0, 20_000) })
    .eq('id', messageId)

  const now = new Date()
  const nowIso = now.toISOString()
  const target = nextStatus(prospect.status, classification)

  // A real answer cancels whatever follow-up was queued: the point of the
  // follow-up was to get one. An auto-reply is not an answer and changes
  // nothing — the person has still not read it.
  const isRealReply = classification !== 'auto_reply'
  const followupFields = isRealReply
    ? {
        last_inbound_at: nowIso,
        next_followup_at:
          target === 'replied' ? scheduleFollowup('replied', 0, now)?.toISOString() ?? null : null,
        followup_claimed_at: null,
        followup_stage: target === 'replied' ? 0 : prospect.followup_stage,
      }
    : {}

  if (target) {
    await db
      .from('outbound_prospects')
      .update({
        status: target,
        replied_at: prospect.replied_at ?? nowIso,
        last_reply_class: classification,
        ...followupFields,
      })
      .eq('id', prospect.id)
  } else if (isRealReply) {
    await db
      .from('outbound_prospects')
      .update({ last_reply_class: classification, ...followupFields })
      .eq('id', prospect.id)
  }

  const status = target ?? prospect.status
  const result: Extract<IngestReplyResult, { matched: true }> = {
    duplicate: false,
    matched: true,
    messageId,
    prospectId: prospect.id,
    classification,
    status,
    moved: target !== null,
  }
  if (!target) return result

  // 4. Side effects of the new state.
  switch (target) {
    case 'interested': {
      const { data: campaign } = await db
        .from('outbound_campaigns')
        .select('name')
        .eq('id', prospect.campaign_id)
        .maybeSingle()
      const { leadId, created } = await upsertLeadFromProspect(prospect, { campaignName: (campaign?.name as string) ?? null })
      await db.from('outbound_prospects').update({ platform_lead_id: leadId }).eq('id', prospect.id)
      await addLeadEvent(leadId, 'outbound_reply', { messageId, snippet, created })

      const demo = await sendDemoEmailOnce({ ...prospect, status: target })
      if (demo === 'sent') await addLeadEvent(leadId, 'demo_email', { prospectId: prospect.id })

      result.leadId = leadId
      result.demoEmail = demo
      break
    }
    case 'not_interested':
      await addSuppression({ email: prospect.email, reason: 'replied_negative', source: `reply:${messageId}` })
      break
    case 'unsubscribed':
      // Not a flag: the address stays on the suppression list and everything
      // else about the person — this reply included — is deleted.
      await eraseProspectByEmail(prospect.email, `reply:${messageId}`)
      break
    case 'bounced':
      await addSuppression({ email: prospect.email, reason: 'bounced', source: `reply:${messageId}` })
      break
    default:
      break
  }

  return result
}

type Db = ReturnType<typeof createServiceRoleClient>

async function matchProspect(
  db: Db,
  keys: { fromEmail: string; threadId?: string | null; inReplyTo?: string | null }
): Promise<Prospect | null> {
  const { data: byEmail } = await db
    .from('outbound_prospects')
    .select('*')
    .eq('email', keys.fromEmail)
    .maybeSingle()
  if (byEmail) return byEmail as Prospect

  // Fallbacks: the reply came from an alias, but Gmail tied it to a message
  // we sent — by thread id, or by the Message-ID we set on the way out.
  let originId: string | null = null
  if (keys.threadId) {
    const { data } = await db
      .from('outbound_messages')
      .select('prospect_id')
      .eq('transport_thread_id', keys.threadId)
      .eq('direction', 'out')
      .not('prospect_id', 'is', null)
      .limit(1)
      .maybeSingle()
    originId = (data?.prospect_id as string | undefined) ?? null
  }
  if (!originId && keys.inReplyTo) {
    // An RFC Message-ID carries '<', '@' and sometimes ','. Two plain eq
    // filters rather than one .or() keeps it out of PostgREST's filter grammar.
    for (const column of ['rfc_message_id', 'transport_message_id'] as const) {
      const { data } = await db
        .from('outbound_messages')
        .select('prospect_id')
        .eq(column, keys.inReplyTo)
        .eq('direction', 'out')
        .not('prospect_id', 'is', null)
        .limit(1)
        .maybeSingle()
      originId = (data?.prospect_id as string | undefined) ?? null
      if (originId) break
    }
  }
  if (!originId) return null

  const { data: byOrigin } = await db.from('outbound_prospects').select('*').eq('id', originId).maybeSingle()
  return (byOrigin as Prospect | null) ?? null
}
