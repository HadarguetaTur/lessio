/**
 * platform_leads — Lessio's own sales leads (Sprint 34 M3 subset).
 *
 * V1 has one writer: a prospect who answered positively. The upsert is keyed
 * on email so a second positive reply (or a later inbound form, once M3
 * lands) updates the same row. An existing lead's status is never moved
 * backwards by the outbound path — a `qualified` lead that replies "yes"
 * again stays `qualified`.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { INBOUND_TERMINAL } from './transitions'
import type { OutboundMessage, PlatformLead, PlatformLeadStatus, Prospect } from './types'

export type LeadEventType = 'outbound_reply' | 'demo_email' | 'status_change' | 'note'

export async function upsertLeadFromProspect(
  prospect: Prospect,
  context: { campaignName: string | null }
): Promise<{ leadId: string; created: boolean }> {
  const db = createServiceRoleClient()

  const { data: existing } = await db
    .from('platform_leads')
    .select('id')
    .eq('email', prospect.email)
    .maybeSingle()

  const name = [prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || null

  if (existing) {
    // Refresh contact details, leave status and notes alone.
    await db
      .from('platform_leads')
      .update({
        name: name ?? undefined,
        phone: prospect.phone ?? undefined,
        company: prospect.company ?? undefined,
        prospect_id: prospect.id,
        source: 'outbound',
        medium: 'email',
        campaign: context.campaignName,
      })
      .eq('id', existing.id)
    return { leadId: existing.id as string, created: false }
  }

  const { data, error } = await db
    .from('platform_leads')
    .insert({
      name,
      email: prospect.email,
      phone: prospect.phone,
      company: prospect.company,
      status: 'new',
      source: 'outbound',
      medium: 'email',
      campaign: context.campaignName,
      prospect_id: prospect.id,
    })
    .select('id')
    .single()

  if (error) {
    // Lost a race with a concurrent reply for the same address.
    if (error.code === '23505') {
      const { data: raced } = await db
        .from('platform_leads')
        .select('id')
        .eq('email', prospect.email)
        .single()
      if (raced) return { leadId: raced.id as string, created: false }
    }
    throw new Error(`[outbound/leads] insert failed: ${error.message}`)
  }
  return { leadId: data.id as string, created: true }
}

export async function addLeadEvent(
  leadId: string,
  type: LeadEventType,
  payload: Record<string, unknown>,
  actorProfileId: string | null = null
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('platform_lead_events')
    .insert({ lead_id: leadId, type, payload, actor_profile_id: actorProfileId })
  if (error) console.error('[outbound/leads] event insert failed', { leadId, type, error: error.message })
}

export async function markLeadLost(leadId: string, reason: string): Promise<void> {
  const db = createServiceRoleClient()
  await db
    .from('platform_leads')
    .update({ status: 'lost', lost_reason: reason })
    .eq('id', leadId)
    .in('status', ['new', 'contacted', 'qualified'])
}

export async function listLeads(limit = 500): Promise<PlatformLead[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('platform_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[outbound/leads] list failed: ${error.message}`)
  return (data ?? []) as PlatformLead[]
}

// ── The founder's writes ─────────────────────────────────────────────────────
// Everything below is a person acting on a lead from the admin screens. Two
// rules apply to all of it: the automated follow-ups stop the moment a human
// takes over, and any inbound reply the classifier could not place counts as
// read once the founder has touched the lead.

export interface LeadStatusChange {
  leadId: string
  status: PlatformLeadStatus
  actorProfileId: string
  lostReason?: string | null
}

export type UpdateLeadStatusResult =
  | { ok: true; previous: PlatformLeadStatus; prospectConverted: boolean }
  | { ok: false; error: 'NOT_FOUND' | 'LOST_REASON_REQUIRED' | 'SAVE_FAILED' }

/** A human took this lead over: nothing automated writes to them any more. */
async function humanTookOver(
  db: ReturnType<typeof createServiceRoleClient>,
  prospectId: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await db
    .from('outbound_prospects')
    .update({ next_followup_at: null, followup_claimed_at: null, ...extra })
    .eq('id', prospectId)
  await db
    .from('outbound_messages')
    .update({ reviewed_at: new Date().toISOString() })
    .eq('prospect_id', prospectId)
    .eq('direction', 'in')
    .is('reviewed_at', null)
}

export async function updateLeadStatus(input: LeadStatusChange): Promise<UpdateLeadStatusResult> {
  const lostReason = input.lostReason?.trim() || null
  if (input.status === 'lost' && !lostReason) return { ok: false, error: 'LOST_REASON_REQUIRED' }

  const db = createServiceRoleClient()
  const { data: lead } = await db
    .from('platform_leads')
    .select('id, status, prospect_id')
    .eq('id', input.leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'NOT_FOUND' }

  const previous = lead.status as PlatformLeadStatus
  const won = input.status === 'trial' || input.status === 'won'
  const closed = won || input.status === 'lost'

  const patch: Record<string, unknown> = {
    status: input.status,
    lost_reason: input.status === 'lost' ? lostReason : null,
  }
  if (won) patch.converted_at = new Date().toISOString()
  // A closed lead has no next step.
  if (closed) {
    patch.next_action_at = null
    patch.next_action_note = null
  }

  const { error } = await db.from('platform_leads').update(patch).eq('id', input.leadId)
  if (error) return { ok: false, error: 'SAVE_FAILED' }

  await addLeadEvent(
    input.leadId,
    'status_change',
    { from: previous, to: input.status, lostReason },
    input.actorProfileId
  )

  let prospectConverted = false
  if (lead.prospect_id) {
    let extra: Record<string, unknown> = {}
    if (won) {
      const { data: prospect } = await db
        .from('outbound_prospects')
        .select('status')
        .eq('id', lead.prospect_id)
        .maybeSingle()
      const current = prospect?.status as string | undefined
      if (current && !(INBOUND_TERMINAL as readonly string[]).includes(current)) {
        extra = { status: 'converted' }
        prospectConverted = true
      }
    }
    await humanTookOver(db, lead.prospect_id as string, extra)
  }

  return { ok: true, previous, prospectConverted }
}

export async function saveLeadNotes(
  leadId: string,
  notes: string | null,
  actorProfileId: string
): Promise<{ ok: true } | { ok: false; error: 'NOT_FOUND' | 'SAVE_FAILED' }> {
  const db = createServiceRoleClient()
  const trimmed = notes?.trim() || null
  const { data, error } = await db
    .from('platform_leads')
    .update({ notes: trimmed })
    .eq('id', leadId)
    .select('prospect_id')
    .maybeSingle()
  if (error) return { ok: false, error: 'SAVE_FAILED' }
  if (!data) return { ok: false, error: 'NOT_FOUND' }
  await addLeadEvent(leadId, 'note', { notes: trimmed }, actorProfileId)
  if (data.prospect_id) await humanTookOver(db, data.prospect_id as string)
  return { ok: true }
}

export async function setLeadNextAction(
  leadId: string,
  at: string | null,
  note: string | null,
  actorProfileId: string
): Promise<{ ok: true } | { ok: false; error: 'NOT_FOUND' | 'SAVE_FAILED' }> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('platform_leads')
    .update({ next_action_at: at, next_action_note: at ? note?.trim() || null : null })
    .eq('id', leadId)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: 'SAVE_FAILED' }
  if (!data) return { ok: false, error: 'NOT_FOUND' }
  await addLeadEvent(leadId, 'note', { nextActionAt: at, nextActionNote: note }, actorProfileId)
  return { ok: true }
}

/** Promotes a prospect the founder wants to work by hand, before any reply. */
export async function createLeadFromProspect(
  prospectId: string
): Promise<{ leadId: string; created: boolean } | null> {
  const db = createServiceRoleClient()
  const { data: prospect } = await db.from('outbound_prospects').select('*').eq('id', prospectId).maybeSingle()
  if (!prospect) return null
  const { data: campaign } = await db
    .from('outbound_campaigns')
    .select('name')
    .eq('id', prospect.campaign_id)
    .maybeSingle()
  const result = await upsertLeadFromProspect(prospect as Prospect, {
    campaignName: (campaign?.name as string | undefined) ?? null,
  })
  await db.from('outbound_prospects').update({ platform_lead_id: result.leadId }).eq('id', prospectId)
  return result
}

// ── The inbox read ───────────────────────────────────────────────────────────

export interface LeadListItem extends PlatformLead {
  prospect: Pick<Prospect, 'id' | 'status' | 'next_followup_at' | 'last_inbound_at' | 'sent_at'> | null
  lastInbound: Pick<OutboundMessage, 'body' | 'created_at' | 'classification'> | null
}

/**
 * Every lead with what the inbox row needs beside it: the prospect's state and
 * the last thing the person wrote. Two queries, not N: the inbound messages of
 * all listed prospects come back in one call and are folded in memory.
 */
export async function listLeadsWithContext(limit = 500): Promise<LeadListItem[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('platform_leads')
    .select(
      '*, prospect:outbound_prospects!platform_leads_prospect_id_fkey(id, status, next_followup_at, last_inbound_at, sent_at)'
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`[outbound/leads] list failed: ${error.message}`)

  const leads = (data ?? []) as (PlatformLead & { prospect: LeadListItem['prospect'] })[]
  const prospectIds = leads.map((l) => l.prospect_id).filter((id): id is string => Boolean(id))

  const lastInbound = new Map<string, LeadListItem['lastInbound']>()
  if (prospectIds.length > 0) {
    const { data: messages } = await db
      .from('outbound_messages')
      .select('prospect_id, body, created_at, classification')
      .in('prospect_id', prospectIds)
      .eq('direction', 'in')
      .order('created_at', { ascending: false })
      .limit(prospectIds.length * 3)
    for (const m of messages ?? []) {
      const key = m.prospect_id as string
      if (!lastInbound.has(key)) {
        lastInbound.set(key, {
          body: m.body as string | null,
          created_at: m.created_at as string,
          classification: m.classification as string | null,
        })
      }
    }
  }

  return leads.map((lead) => ({
    ...lead,
    prospect: lead.prospect ?? null,
    lastInbound: lead.prospect_id ? (lastInbound.get(lead.prospect_id) ?? null) : null,
  }))
}
