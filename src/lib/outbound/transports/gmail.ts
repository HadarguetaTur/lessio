/**
 * The send run: claim a few prospects, send each from the mailbox with the
 * most room today, report back to the queue.
 *
 * Paced like a person, not a pipe: a handful per run, a random pause between
 * sends, only inside the Israel working window. A failed send goes back
 * through the queue's 3-attempt ladder; a failed *mailbox* (delegation
 * revoked, user suspended) is marked so the next pick skips it and the admin
 * sees why on /admin/outbound.
 */

import { sendAsUser } from '@/lib/gmail/serviceAccount'
import { unsubscribeHeaders } from '../unsubscribe'
import { describeThrown, reportError } from '@/lib/telemetry/reportError'
import { claimNextProspects, recordSendResult } from '../queue'
import {
  isInSendWindow,
  listMailboxesWithUsage,
  markMailboxError,
  pickMailbox,
  remainingCapacity,
  type MailboxWithUsage,
} from '../mailboxes'

export const DEFAULT_BATCH = 5
const PAUSE_MIN_MS = 20_000
const PAUSE_MAX_MS = 60_000

export interface SendRunResult {
  skipped?: 'outside_window' | 'no_mailbox' | 'caps_reached' | 'queue_empty'
  sent: number
  failed: number
  remainingCapacity: number
  details: { prospectId: string; mailbox: string; ok: boolean; error?: string }[]
}

export async function runSendBatch(opts: {
  now?: Date
  batch?: number
  /** Skip the window check and the pauses — for a manual test run. */
  immediate?: boolean
  sleep?: (ms: number) => Promise<void>
} = {}): Promise<SendRunResult> {
  const now = opts.now ?? new Date()
  const sleep = opts.sleep ?? defaultSleep
  const result: SendRunResult = { sent: 0, failed: 0, remainingCapacity: 0, details: [] }

  if (!opts.immediate && !isInSendWindow(now)) return { ...result, skipped: 'outside_window' }

  const boxes = await listMailboxesWithUsage(now)
  result.remainingCapacity = remainingCapacity(boxes)
  if (boxes.length === 0) return { ...result, skipped: 'no_mailbox' }
  if (!pickMailbox(boxes)) return { ...result, skipped: 'caps_reached' }

  const limit = Math.min(opts.batch ?? DEFAULT_BATCH, result.remainingCapacity)
  const claimed = await claimNextProspects({ limit, now })
  if (claimed.length === 0) return { ...result, skipped: 'queue_empty' }

  for (let i = 0; i < claimed.length; i++) {
    const item = claimed[i]!
    const mailbox = pickMailbox(boxes)
    if (!mailbox) {
      // The pool filled up mid-run; release the lease through the normal path.
      await recordSendResult({ prospectId: item.prospect.id, ok: false, error: 'no mailbox with capacity' })
      result.failed++
      continue
    }

    const outcome = await sendOne(mailbox, item)
    result.details.push({ prospectId: item.prospect.id, mailbox: mailbox.email, ...outcome })
    if (outcome.ok) {
      result.sent++
      mailbox.sentToday++
      result.remainingCapacity = Math.max(0, result.remainingCapacity - 1)
    } else {
      result.failed++
    }

    if (!opts.immediate && i < claimed.length - 1) {
      await sleep(PAUSE_MIN_MS + Math.floor(Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS)))
    }
  }

  return result
}

async function sendOne(
  mailbox: MailboxWithUsage,
  item: Awaited<ReturnType<typeof claimNextProspects>>[number]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sent = await sendAsUser({
      from: mailbox.email,
      fromName: mailbox.display_name,
      to: item.prospect.email,
      subject: item.message.subject,
      html: item.message.bodyHtml,
      text: item.message.bodyText,
      headers: unsubscribeHeaders(item.prospect.unsubscribe_token),
    })
    await recordSendResult({
      prospectId: item.prospect.id,
      ok: true,
      transportMessageId: sent.id,
      transportThreadId: sent.threadId,
      rfcMessageId: sent.rfcMessageId,
      subject: item.message.subject,
      mailboxId: mailbox.id,
    })
    if (mailbox.last_error) await markMailboxError(mailbox.id, null)
    return { ok: true }
  } catch (thrown) {
    const { name, message } = describeThrown(thrown)
    const error = `${name}: ${message}`
    await recordSendResult({ prospectId: item.prospect.id, ok: false, error, mailboxId: mailbox.id })

    if (isMailboxFault(message)) {
      await markMailboxError(mailbox.id, error)
      mailbox.is_active = false // for the rest of this run only
      await reportError({
        name: 'OutboundMailboxFault',
        message: `${mailbox.email}: ${error}`,
        route: '/api/internal/outbound/run-send',
        source: 'server',
      })
    }
    return { ok: false, error }
  }
}

/** Errors that mean the mailbox, not the recipient, is the problem. */
export function isMailboxFault(message: string): boolean {
  return /invalid_grant|unauthorized_client|Precondition check failed|Mail service not enabled|Delegation denied|403|401/i.test(
    message
  )
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
