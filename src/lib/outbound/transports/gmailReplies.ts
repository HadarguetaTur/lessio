/**
 * The reply poll: read each outreach mailbox's inbox since its last poll and
 * hand every new message to ingestReply.
 *
 * Polling by time, with a 10-minute overlap, is enough because ingestReply is
 * idempotent on the Gmail message id — a message seen twice is dropped at the
 * unique index. A mailbox that fails (delegation revoked, user suspended) is
 * marked and skipped; the others still get polled.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getInboxMessage, listInboxSince } from '@/lib/gmail/serviceAccount'
import { describeThrown, reportError } from '@/lib/telemetry/reportError'
import { ingestReply, type IngestReplyResult } from '../ingestReply'
import { listMailboxes, markMailboxError, markMailboxPolled, type Mailbox } from '../mailboxes'

const OVERLAP_MINUTES = 10
/** A mailbox never polled before looks this far back. */
const FIRST_POLL_LOOKBACK_HOURS = 24
const MAX_PER_MAILBOX = 100

export interface ReplyRunResult {
  mailboxes: number
  fetched: number
  duplicates: number
  matched: number
  unmatched: number
  interested: number
  errors: { mailbox: string; error: string }[]
}

export async function runReplyPoll(opts: { now?: Date } = {}): Promise<ReplyRunResult> {
  const now = opts.now ?? new Date()
  const result: ReplyRunResult = { mailboxes: 0, fetched: 0, duplicates: 0, matched: 0, unmatched: 0, interested: 0, errors: [] }

  const boxes = (await listMailboxes()).filter((b) => b.is_active)
  result.mailboxes = boxes.length

  for (const box of boxes) {
    try {
      const outcomes = await pollMailbox(box, now)
      for (const o of outcomes) {
        result.fetched++
        if (o.duplicate) result.duplicates++
        else if (!o.matched) result.unmatched++
        else {
          result.matched++
          if (o.classification === 'interested' && o.moved) result.interested++
        }
      }
      await markMailboxPolled(box.id, now)
    } catch (thrown) {
      const { name, message } = describeThrown(thrown)
      const error = `${name}: ${message}`
      result.errors.push({ mailbox: box.email, error })
      await markMailboxError(box.id, error, now)
      await reportError({
        name: 'OutboundReplyPollFailed',
        message: `${box.email}: ${error}`,
        route: '/api/internal/outbound/run-replies',
        source: 'server',
      })
    }
  }

  return result
}

async function pollMailbox(box: Mailbox, now: Date): Promise<IngestReplyResult[]> {
  const since = box.last_polled_at
    ? DateTime.fromISO(box.last_polled_at).minus({ minutes: OVERLAP_MINUTES })
    : DateTime.fromJSDate(now).minus({ hours: FIRST_POLL_LOOKBACK_HOURS })

  const refs = await listInboxSince(box.email, { afterEpochSeconds: since.toSeconds(), max: MAX_PER_MAILBOX })
  const outcomes: IngestReplyResult[] = []
  if (refs.length === 0) return outcomes

  // The overlap re-lists messages already ingested; skip them before the
  // per-message fetch so a quiet inbox costs one API call per poll.
  const db = createServiceRoleClient()
  const { data: known } = await db
    .from('outbound_messages')
    .select('transport_message_id')
    .eq('transport', 'gmail')
    .in('transport_message_id', refs.map((r) => r.id))
  const seen = new Set((known ?? []).map((k) => k.transport_message_id as string))

  for (const ref of refs) {
    if (seen.has(ref.id)) {
      outcomes.push({ duplicate: true })
      continue
    }
    const msg = await getInboxMessage(box.email, ref.id)
    // The mailbox's own sends are excluded by the query; a self-addressed
    // test would still come back, and must not be classified as a reply.
    if (msg.fromEmail.toLowerCase() === box.email.toLowerCase()) continue

    outcomes.push(
      await ingestReply({
        fromEmail: msg.fromEmail,
        subject: msg.subject,
        bodyText: msg.bodyText,
        transportMessageId: msg.id,
        transportThreadId: msg.threadId,
        inReplyTo: msg.inReplyTo,
        receivedAt: msg.receivedAt,
        mailboxId: box.id,
      })
    )
  }
  return outcomes
}
