/**
 * The outbound queue, as seen by the transport.
 *
 * Two calls: claim a batch (rendered and ready to send) and report how the
 * send went. Claiming is a lease, not a commitment — a prospect whose lease
 * expires without a report becomes eligible again, so a send run that died
 * between claim and send heals itself. The report is guarded on `claimed` so
 * a late duplicate cannot flip a prospect that has since replied.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { reportError } from '@/lib/telemetry/reportError'
import { renderCampaignMessage, type RenderedMessage } from './renderTemplate'
import type { Campaign, Prospect } from './types'

export const MAX_SEND_ATTEMPTS = 3
export const DEFAULT_LEASE_MINUTES = 30

export interface ClaimedProspect {
  prospect: Prospect
  campaign: Pick<Campaign, 'id' | 'name' | 'locale'>
  message: RenderedMessage
}

export async function claimNextProspects(opts: {
  limit: number
  campaignId?: string | null
  now?: Date
  leaseMinutes?: number
}): Promise<ClaimedProspect[]> {
  const db = createServiceRoleClient()
  const now = opts.now ?? new Date()
  const lease = opts.leaseMinutes ?? DEFAULT_LEASE_MINUTES

  const { data, error } = await db.rpc('claim_next_outbound_prospects', {
    p_now: now.toISOString(),
    p_lease: `${lease} minutes`,
    p_limit: opts.limit,
    p_campaign_id: opts.campaignId ?? null,
  })
  if (error) throw new Error(`[outbound/queue] claim failed: ${error.message}`)

  const prospects = (data ?? []) as Prospect[]
  if (prospects.length === 0) return []

  const campaignIds = [...new Set(prospects.map((p) => p.campaign_id))]
  const { data: campaignRows, error: campaignErr } = await db
    .from('outbound_campaigns')
    .select('*')
    .in('id', campaignIds)
  if (campaignErr) throw new Error(`[outbound/queue] campaign load failed: ${campaignErr.message}`)
  const campaigns = new Map((campaignRows ?? []).map((c) => [c.id as string, c as Campaign]))

  const out: ClaimedProspect[] = []
  for (const prospect of prospects) {
    const campaign = campaigns.get(prospect.campaign_id)
    if (!campaign) continue // cannot happen: the claim joined on it
    out.push({
      prospect,
      campaign: { id: campaign.id, name: campaign.name, locale: campaign.locale },
      message: renderCampaignMessage(campaign, prospect),
    })
  }
  return out
}

export type SendResultOutcome =
  | { ok: true; status: 'sent' | 'queued' | 'failed' }
  | { ok: false; error: 'NOT_FOUND' | 'NOT_CLAIMED'; status?: string }

export async function recordSendResult(input: {
  prospectId: string
  ok: boolean
  transportMessageId?: string | null
  transportThreadId?: string | null
  rfcMessageId?: string | null
  subject?: string | null
  error?: string | null
  /** The outbound_mailboxes row the message went out from. */
  mailboxId?: string | null
}): Promise<SendResultOutcome> {
  const db = createServiceRoleClient()

  const { data: current, error: loadErr } = await db
    .from('outbound_prospects')
    .select('id, status, send_attempts, email')
    .eq('id', input.prospectId)
    .maybeSingle()
  if (loadErr) throw new Error(`[outbound/queue] load failed: ${loadErr.message}`)
  if (!current) return { ok: false, error: 'NOT_FOUND' }

  if (current.status !== 'claimed') {
    // A retried /sent for a message we already recorded is fine.
    if (input.ok && current.status === 'sent' && input.transportMessageId) {
      const { data: existing } = await db
        .from('outbound_messages')
        .select('id')
        .eq('transport', 'gmail')
        .eq('transport_message_id', input.transportMessageId)
        .maybeSingle()
      if (existing) return { ok: true, status: 'sent' }
    }
    return { ok: false, error: 'NOT_CLAIMED', status: current.status as string }
  }

  const nowIso = new Date().toISOString()

  if (input.ok) {
    const { data: updated, error: updErr } = await db
      .from('outbound_prospects')
      .update({
        status: 'sent',
        sent_at: nowIso,
        send_attempts: (current.send_attempts as number) + 1,
        mailbox_id: input.mailboxId ?? null,
      })
      .eq('id', input.prospectId)
      .eq('status', 'claimed')
      .select('id')
    if (updErr) throw new Error(`[outbound/queue] mark sent failed: ${updErr.message}`)
    if (!updated || updated.length === 0) return { ok: false, error: 'NOT_CLAIMED' }

    const { error: msgErr } = await db.from('outbound_messages').insert({
      prospect_id: input.prospectId,
      direction: 'out',
      kind: 'cold_email',
      transport: 'gmail',
      mailbox_id: input.mailboxId ?? null,
      transport_message_id: input.transportMessageId ?? null,
      transport_thread_id: input.transportThreadId ?? null,
      rfc_message_id: input.rfcMessageId ?? null,
      subject: input.subject ?? null,
    })
    // A duplicate transport id means the same send was reported twice; the
    // prospect is already `sent`, so this is not an error worth failing on.
    if (msgErr && msgErr.code !== '23505') {
      console.error('[outbound/queue] message log failed', { prospectId: input.prospectId, error: msgErr.message })
    }
    return { ok: true, status: 'sent' }
  }

  const attempts = (current.send_attempts as number) + 1
  const exhausted = attempts >= MAX_SEND_ATTEMPTS
  const { data: updated, error: updErr } = await db
    .from('outbound_prospects')
    .update({ status: exhausted ? 'failed' : 'queued', send_attempts: attempts, claimed_at: null })
    .eq('id', input.prospectId)
    .eq('status', 'claimed')
    .select('id')
  if (updErr) throw new Error(`[outbound/queue] mark failed failed: ${updErr.message}`)
  if (!updated || updated.length === 0) return { ok: false, error: 'NOT_CLAIMED' }

  await db.from('outbound_messages').insert({
    prospect_id: input.prospectId,
    direction: 'out',
    kind: 'cold_email',
    transport: 'gmail',
    mailbox_id: input.mailboxId ?? null,
    subject: input.subject ?? null,
    error: (input.error ?? 'send failed').slice(0, 500),
  })

  if (exhausted) {
    await reportError({
      name: 'OutboundSendExhausted',
      message: `prospect ${input.prospectId} failed ${attempts} sends: ${input.error ?? 'unknown'}`,
      route: '/api/internal/outbound/run-send',
      source: 'server',
    })
  }
  return { ok: true, status: exhausted ? 'failed' : 'queued' }
}
