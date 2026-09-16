/**
 * Everything the lead card shows, resolved from either side.
 *
 * A lead may have no prospect (a center inquiry from a signed-up org) and a
 * prospect may have no lead yet (nobody replied). The card opens from both
 * screens, so it is keyed by whichever id the screen has and resolves the
 * other half if it exists. Every field of the result may be null except the
 * arrays.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { demoState, type DemoState } from './leadInbox'
import type { Mailbox } from './mailboxes'
import type { Campaign, OutboundMessage, PlatformLead, Prospect } from './types'

export interface LeadEvent {
  id: string
  type: string
  payload: Record<string, unknown>
  actor_profile_id: string | null
  created_at: string
}

export interface LeadCardData {
  lead: PlatformLead | null
  prospect: Prospect | null
  campaign: Pick<Campaign, 'id' | 'name'> | null
  mailbox: Pick<Mailbox, 'id' | 'email' | 'display_name'> | null
  thread: OutboundMessage[]
  events: LeadEvent[]
  /** Whether the demo email went out, derived from the thread and the prospect. */
  demo: DemoState
}

/** The last demo email in a thread, newest first. Pure. */
export function lastDemoInThread(thread: OutboundMessage[]): OutboundMessage | null {
  let last: OutboundMessage | null = null
  for (const m of thread) {
    if (m.direction === 'out' && m.kind === 'demo_email' && (!last || m.created_at > last.created_at)) last = m
  }
  return last
}

export type LeadCardKey = { leadId: string } | { prospectId: string }

export async function getLeadCardData(key: LeadCardKey): Promise<LeadCardData | null> {
  const db = createServiceRoleClient()

  let lead: PlatformLead | null = null
  let prospect: Prospect | null = null

  if ('leadId' in key) {
    const { data } = await db.from('platform_leads').select('*').eq('id', key.leadId).maybeSingle()
    lead = (data as PlatformLead | null) ?? null
    if (lead?.prospect_id) {
      const { data: p } = await db.from('outbound_prospects').select('*').eq('id', lead.prospect_id).maybeSingle()
      prospect = (p as Prospect | null) ?? null
    }
  } else {
    const { data } = await db.from('outbound_prospects').select('*').eq('id', key.prospectId).maybeSingle()
    prospect = (data as Prospect | null) ?? null
    if (prospect) {
      // Prefer the pointer on the prospect; fall back to the lead that points here.
      const q = prospect.platform_lead_id
        ? db.from('platform_leads').select('*').eq('id', prospect.platform_lead_id)
        : db.from('platform_leads').select('*').eq('prospect_id', prospect.id)
      const { data: l } = await q.maybeSingle()
      lead = (l as PlatformLead | null) ?? null
    }
  }

  if (!lead && !prospect) return null

  const [campaignRes, mailboxRes, threadRes, eventsRes] = await Promise.all([
    prospect
      ? db.from('outbound_campaigns').select('id, name').eq('id', prospect.campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
    prospect?.mailbox_id
      ? db.from('outbound_mailboxes').select('id, email, display_name').eq('id', prospect.mailbox_id).maybeSingle()
      : Promise.resolve({ data: null }),
    prospect
      ? db
          .from('outbound_messages')
          .select('id, prospect_id, direction, kind, mailbox_id, from_email, subject, body, classification, error, reviewed_at, transport, transport_message_id, created_at')
          .eq('prospect_id', prospect.id)
          .order('created_at', { ascending: true })
          .limit(200)
      : Promise.resolve({ data: [] }),
    lead
      ? db
          .from('platform_lead_events')
          .select('id, type, payload, actor_profile_id, created_at')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: true })
          .limit(200)
      : Promise.resolve({ data: [] }),
  ])

  const thread = (threadRes.data ?? []) as OutboundMessage[]
  return {
    lead,
    prospect,
    campaign: (campaignRes.data as LeadCardData['campaign']) ?? null,
    mailbox: (mailboxRes.data as LeadCardData['mailbox']) ?? null,
    thread,
    events: (eventsRes.data ?? []) as LeadEvent[],
    demo: demoState(prospect, lastDemoInThread(thread)),
  }
}

export type TimelineItem =
  | { kind: 'message'; at: string; message: OutboundMessage }
  | { kind: 'event'; at: string; event: LeadEvent }

/** One chronological stream: what was sent and received, and what the founder did. Pure. */
export function mergeTimeline(thread: OutboundMessage[], events: LeadEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...thread.map((message) => ({ kind: 'message' as const, at: message.created_at, message })),
    // The automated engine already logs its own outbound_reply / demo_email as
    // messages; those events would show twice.
    ...events
      .filter((e) => e.type !== 'outbound_reply' && e.type !== 'demo_email')
      .map((event) => ({ kind: 'event' as const, at: event.created_at, event })),
  ]
  return items.sort((a, b) => a.at.localeCompare(b.at))
}
