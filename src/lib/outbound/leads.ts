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
import type { PlatformLead, Prospect } from './types'

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
