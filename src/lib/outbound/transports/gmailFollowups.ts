/**
 * The follow-up run: send the touches that came due, inside the thread the
 * conversation already has.
 *
 * Threading is not cosmetic. A follow-up that starts a new thread reads as a
 * second cold email; the same conversation reads as a person continuing a
 * sentence. Gmail threads a message when three things line up: the same
 * `threadId` in the send request, an `In-Reply-To` naming a message the
 * recipient has, and a subject that matches (a `Re:` prefix is fine).
 *
 * Follow-ups share the cold run's daily cap — the mailbox counts every
 * outbound Gmail message — and they must use the mailbox that sent the
 * original, since that is where the thread lives.
 */

import { sendAsUser } from '@/lib/gmail/serviceAccount'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { describeThrown, reportError } from '@/lib/telemetry/reportError'
import { followupMessage, scheduleFollowup, trackFor } from '../followups'
import { renderPersonalEmail } from '../renderTemplate'
import { unsubscribeHeaders, unsubscribeUrl } from '../unsubscribe'
import {
  isInSendWindow,
  listMailboxesWithUsage,
  markMailboxError,
  type MailboxWithUsage,
} from '../mailboxes'
import { isMailboxFault } from './gmail'
import type { Prospect } from '../types'

export const DEFAULT_FOLLOWUP_BATCH = 5
export const MAX_FOLLOWUP_ATTEMPTS = 3
const LEASE_MINUTES = 30
const PAUSE_MIN_MS = 20_000
const PAUSE_MAX_MS = 60_000

export interface FollowupRunResult {
  skipped?: 'outside_window' | 'no_mailbox' | 'none_due'
  sent: number
  failed: number
  deferred: number
  details: { prospectId: string; stage: number; ok: boolean; reason?: string }[]
}

const defaultSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runFollowupBatch(
  opts: {
    now?: Date
    batch?: number
    /** Skip the window check and the pauses — for a manual test run. */
    immediate?: boolean
    sleep?: (ms: number) => Promise<void>
  } = {}
): Promise<FollowupRunResult> {
  const now = opts.now ?? new Date()
  const sleep = opts.sleep ?? defaultSleep
  const db = createServiceRoleClient()
  const result: FollowupRunResult = { sent: 0, failed: 0, deferred: 0, details: [] }

  if (!opts.immediate && !isInSendWindow(now)) return { ...result, skipped: 'outside_window' }

  const boxes = await listMailboxesWithUsage(now)
  if (boxes.length === 0) return { ...result, skipped: 'no_mailbox' }
  const byId = new Map(boxes.map((b) => [b.id, b]))

  const { data, error } = await db.rpc('claim_due_followups', {
    p_now: now.toISOString(),
    p_lease: `${LEASE_MINUTES} minutes`,
    p_limit: opts.batch ?? DEFAULT_FOLLOWUP_BATCH,
  })
  if (error) throw new Error(`[outbound/followups] claim failed: ${error.message}`)

  const due = (data ?? []) as Prospect[]
  if (due.length === 0) return { ...result, skipped: 'none_due' }

  for (let i = 0; i < due.length; i++) {
    const prospect = due[i]!
    const mailbox = prospect.mailbox_id ? byId.get(prospect.mailbox_id) : undefined

    // The thread lives in one mailbox; if that one is out of room or turned
    // off, the follow-up waits rather than arriving from a stranger.
    if (!mailbox || !mailbox.is_active || mailbox.sentToday >= mailbox.daily_cap) {
      await releaseLease(db, prospect.id)
      result.deferred++
      result.details.push({ prospectId: prospect.id, stage: prospect.followup_stage, ok: false, reason: 'mailbox_unavailable' })
      continue
    }

    const outcome = await sendOne(db, prospect, mailbox, now)
    result.details.push({ prospectId: prospect.id, stage: prospect.followup_stage, ...outcome })
    if (outcome.ok) {
      result.sent++
      mailbox.sentToday++
    } else if (outcome.reason === 'deferred') {
      result.deferred++
    } else {
      result.failed++
    }

    if (!opts.immediate && i < due.length - 1) {
      await sleep(PAUSE_MIN_MS + Math.floor(Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS)))
    }
  }

  return result
}

type Db = ReturnType<typeof createServiceRoleClient>

async function releaseLease(db: Db, prospectId: string): Promise<void> {
  await db.from('outbound_prospects').update({ followup_claimed_at: null }).eq('id', prospectId)
}

async function sendOne(
  db: Db,
  prospect: Prospect,
  mailbox: MailboxWithUsage,
  now: Date
): Promise<{ ok: boolean; reason?: string }> {
  const track = trackFor(prospect.status, prospect.demo_email_sent_at)
  if (!track) {
    await stopFollowups(db, prospect.id)
    return { ok: false, reason: 'wrong_status' }
  }

  // The conversation so far: the cold email carries the thread, the last
  // inbound message carries the id a reply should quote.
  const { data: cold } = await db
    .from('outbound_messages')
    .select('subject, transport_thread_id, rfc_message_id')
    .eq('prospect_id', prospect.id)
    .eq('direction', 'out')
    .eq('kind', 'cold_email')
    .is('error', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!cold?.subject) {
    // Nothing to reply to (the cold email predates threading, or is gone).
    await stopFollowups(db, prospect.id)
    return { ok: false, reason: 'no_thread' }
  }

  const { data: lastInbound } = await db
    .from('outbound_messages')
    .select('rfc_message_id')
    .eq('prospect_id', prospect.id)
    .eq('direction', 'in')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // A reply may have landed between the claim and here; it cancels this touch.
  const { data: fresh } = await db
    .from('outbound_prospects')
    .select('next_followup_at')
    .eq('id', prospect.id)
    .maybeSingle()
  if (!fresh?.next_followup_at) {
    await releaseLease(db, prospect.id)
    return { ok: false, reason: 'deferred' }
  }

  const message = followupMessage(
    track,
    prospect.followup_stage,
    {
      firstName: prospect.first_name,
      signupUrl: `${getShareableBaseUrl()}/signup?ref=outbound`,
      subject: cold.subject as string,
      gender: prospect.gender,
    },
    prospect.locale
  )
  const body = renderPersonalEmail(
    message.text,
    prospect.locale,
    unsubscribeUrl(prospect.unsubscribe_token),
    false
  )

  try {
    const sent = await sendAsUser({
      from: mailbox.email,
      fromName: mailbox.display_name,
      to: prospect.email,
      subject: message.subject,
      html: body.bodyHtml,
      text: body.bodyText,
      threadId: (cold.transport_thread_id as string | null) ?? undefined,
      inReplyTo: (lastInbound?.rfc_message_id as string | null) ?? (cold.rfc_message_id as string | null),
      references: [cold.rfc_message_id as string | null, lastInbound?.rfc_message_id as string | null],
      headers: unsubscribeHeaders(prospect.unsubscribe_token),
    })

    await db.from('outbound_messages').insert({
      prospect_id: prospect.id,
      direction: 'out',
      kind: 'followup',
      transport: 'gmail',
      mailbox_id: mailbox.id,
      transport_message_id: sent.id,
      transport_thread_id: sent.threadId,
      rfc_message_id: sent.rfcMessageId,
      subject: message.subject,
      body: body.bodyText,
    })

    const nextStage = prospect.followup_stage + 1
    await db
      .from('outbound_prospects')
      .update({
        followup_stage: nextStage,
        next_followup_at: scheduleFollowup(track, nextStage, now)?.toISOString() ?? null,
        followup_claimed_at: null,
        followup_attempts: 0,
      })
      .eq('id', prospect.id)

    if (mailbox.last_error) await markMailboxError(mailbox.id, null)
    return { ok: true }
  } catch (thrown) {
    const { name, message: msg } = describeThrown(thrown)
    const error = `${name}: ${msg}`
    const attempts = prospect.followup_attempts + 1
    const exhausted = attempts >= MAX_FOLLOWUP_ATTEMPTS

    await db.from('outbound_messages').insert({
      prospect_id: prospect.id,
      direction: 'out',
      kind: 'followup',
      transport: 'gmail',
      mailbox_id: mailbox.id,
      subject: message.subject,
      error: error.slice(0, 500),
    })
    await db
      .from('outbound_prospects')
      .update({
        followup_attempts: attempts,
        followup_claimed_at: null,
        ...(exhausted ? { next_followup_at: null } : {}),
      })
      .eq('id', prospect.id)

    if (isMailboxFault(msg)) {
      await markMailboxError(mailbox.id, error)
      mailbox.is_active = false
    }
    if (exhausted) {
      await reportError({
        name: 'OutboundFollowupExhausted',
        message: `prospect ${prospect.id} failed ${attempts} follow-ups: ${error}`,
        route: '/api/internal/outbound/run-followups',
        source: 'server',
      })
    }
    return { ok: false, reason: error }
  }
}

/** Retires the track without touching the conversation. */
async function stopFollowups(db: Db, prospectId: string): Promise<void> {
  await db
    .from('outbound_prospects')
    .update({ next_followup_at: null, followup_claimed_at: null })
    .eq('id', prospectId)
}
