/**
 * Which lead deserves the founder's attention first. Pure.
 *
 * The inbox is not sorted by date; it is sorted by "what happens if I ignore
 * this today". A reminder that came due beats a new lead, a new lead beats a
 * person who wrote back and is waiting, and anything already won or lost
 * sinks to the bottom whatever else is true about it.
 */

import { DateTime } from 'luxon'
import type { LeadListItem } from './leads'
import type { PlatformLeadStatus } from './types'

export type LeadAttention = 'next_action_due' | 'new' | 'unanswered_reply' | 'none'

const CLOSED: readonly PlatformLeadStatus[] = ['won', 'lost']

export function leadAttention(lead: LeadListItem, now: DateTime): LeadAttention {
  if (CLOSED.includes(lead.status)) return 'none'
  if (lead.next_action_at && DateTime.fromISO(lead.next_action_at) <= now) return 'next_action_due'
  if (lead.status === 'new') return 'new'
  // They wrote after the last time anyone touched the lead.
  if (lead.lastInbound && DateTime.fromISO(lead.lastInbound.created_at) > DateTime.fromISO(lead.updated_at)) {
    return 'unanswered_reply'
  }
  return 'none'
}

const RANK: Record<LeadAttention, number> = { next_action_due: 0, new: 1, unanswered_reply: 2, none: 3 }

/** Stable: equal keys keep their input order, so a re-render never shuffles rows. */
export function rankLeads(leads: LeadListItem[], now: DateTime): LeadListItem[] {
  const keyed = leads.map((lead, index) => {
    const attention = leadAttention(lead, now)
    const closed = CLOSED.includes(lead.status)
    let secondary: number
    switch (attention) {
      case 'next_action_due':
        secondary = DateTime.fromISO(lead.next_action_at!).toMillis() // earliest due first
        break
      case 'new':
        secondary = -DateTime.fromISO(lead.created_at).toMillis() // newest first
        break
      case 'unanswered_reply':
        secondary = -DateTime.fromISO(lead.lastInbound!.created_at).toMillis()
        break
      default:
        secondary = -DateTime.fromISO(lead.updated_at).toMillis()
    }
    return { lead, index, primary: closed ? 4 : RANK[attention], secondary }
  })
  keyed.sort((a, b) => a.primary - b.primary || a.secondary - b.secondary || a.index - b.index)
  return keyed.map((k) => k.lead)
}

export function countByStatus(
  leads: LeadListItem[],
  now: DateTime
): Record<PlatformLeadStatus | 'all' | 'attention', number> {
  const counts: Record<string, number> = {
    all: leads.length,
    attention: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    trial: 0,
    won: 0,
    lost: 0,
  }
  for (const lead of leads) {
    counts[lead.status] = (counts[lead.status] ?? 0) + 1
    if (leadAttention(lead, now) !== 'none') counts.attention!++
  }
  return counts as Record<PlatformLeadStatus | 'all' | 'attention', number>
}
