/**
 * The numbers on /admin/outbound. Head counts only — no rows cross the
 * wire — same approach as src/lib/superadmin/navCounts.ts.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  isInSendWindow,
  nextSendWindowStart,
  remainingCapacity,
  startOfLocalDay,
  type MailboxWithUsage,
} from './mailboxes'

export interface OutboundStats {
  queued: number
  sent7d: number
  replies7d: number
  interested7d: number
}

export async function getOutboundStats(now: Date = new Date()): Promise<OutboundStats> {
  const db = createServiceRoleClient()
  const since = DateTime.fromJSDate(now).minus({ days: 7 }).toISO()!

  const [queued, sent, replies, interested] = await Promise.all([
    db.from('outbound_prospects').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    db.from('outbound_prospects').select('id', { count: 'exact', head: true }).gte('sent_at', since),
    db
      .from('outbound_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'in')
      .neq('classification', 'auto_reply')
      .gte('created_at', since),
    db
      .from('outbound_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'in')
      .eq('classification', 'interested')
      .gte('created_at', since),
  ])

  return {
    queued: queued.count ?? 0,
    sent7d: sent.count ?? 0,
    replies7d: replies.count ?? 0,
    interested7d: interested.count ?? 0,
  }
}

// ── The cockpit ─────────────────────────────────────────────────────────────
// "What is waiting for me, and is the machine running": the only questions
// the landing tab answers.

export interface OutboundCockpit {
  /** Drafted lines a person has not approved or skipped yet. */
  openersToReview: number
  /** Inbound messages the classifier could not place and nobody has read. */
  repliesToReview: number
  newLeads: number
  dueNextActions: number
  /** People who said yes whose demo email the provider rejected and nobody resent. */
  demoFailed: number
  mailboxErrors: { id: string; email: string; last_error: string; last_error_at: string | null }[]
  queued: number
  sentToday: number
  repliesToday: number
  interested7d: number
  sending: {
    active: boolean
    nextWindowStart: string | null
    remainingCapacity: number
    activeMailboxes: number
  }
}

export async function getOutboundCockpit(
  mailboxes: MailboxWithUsage[],
  now: Date = new Date()
): Promise<OutboundCockpit> {
  const db = createServiceRoleClient()
  const nowIso = now.toISOString()
  const dayStart = startOfLocalDay(now)
  const since7d = DateTime.fromJSDate(now).minus({ days: 7 }).toISO()!

  const count = (table: string) => db.from(table).select('id', { count: 'exact', head: true })

  const [openers, replies, newLeads, dueActions, queued, sentToday, repliesToday, interested, demoFailures] =
    await Promise.all([
      count('outbound_prospects').in('opener_status', ['pending', 'generated', 'failed']).eq('status', 'queued'),
      count('outbound_messages')
        .eq('direction', 'in')
        .is('reviewed_at', null)
        .in('classification', ['unknown', 'unmatched']),
      count('platform_leads').eq('status', 'new'),
      count('platform_leads').lte('next_action_at', nowIso).not('status', 'in', '("won","lost")'),
      count('outbound_prospects').eq('status', 'queued'),
      count('outbound_messages')
        .eq('direction', 'out')
        .in('kind', ['cold_email', 'followup', 'demo_email'])
        .is('error', null)
        .gte('created_at', dayStart),
      count('outbound_messages')
        .eq('direction', 'in')
        .neq('classification', 'auto_reply')
        .gte('created_at', dayStart),
      count('outbound_messages').eq('direction', 'in').eq('classification', 'interested').gte('created_at', since7d),
      // A rejected demo releases the prospect's claim, so "failed and still
      // unsent" is a failed row whose prospect has no demo_email_sent_at.
      db
        .from('outbound_messages')
        .select('prospect_id, prospect:outbound_prospects!inner(demo_email_sent_at)')
        .eq('direction', 'out')
        .eq('kind', 'demo_email')
        .not('error', 'is', null)
        .is('prospect.demo_email_sent_at', null)
        .gte('created_at', since7d)
        .limit(200),
    ])
  const demoFailed = new Set(
    ((demoFailures.data ?? []) as { prospect_id: string | null }[]).map((r) => r.prospect_id).filter(Boolean)
  ).size

  const active = isInSendWindow(now)
  const next = active ? null : nextSendWindowStart(now)

  return {
    openersToReview: openers.count ?? 0,
    repliesToReview: replies.count ?? 0,
    newLeads: newLeads.count ?? 0,
    dueNextActions: dueActions.count ?? 0,
    demoFailed,
    mailboxErrors: mailboxes
      .filter((m) => m.last_error)
      .map((m) => ({ id: m.id, email: m.email, last_error: m.last_error!, last_error_at: m.last_error_at })),
    queued: queued.count ?? 0,
    sentToday: sentToday.count ?? 0,
    repliesToday: repliesToday.count ?? 0,
    interested7d: interested.count ?? 0,
    sending: {
      active,
      nextWindowStart: next ? next.toISOString() : null,
      remainingCapacity: remainingCapacity(mailboxes),
      activeMailboxes: mailboxes.filter((m) => m.is_active).length,
    },
  }
}
