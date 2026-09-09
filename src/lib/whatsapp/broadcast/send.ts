/**
 * Starting a campaign, and draining it.
 *
 * Two entry points with a deliberate split:
 *   `startCampaign` runs inside a server action. It resolves the audience,
 *   asks the guard, and writes the recipient rows — fast, and answerable to the
 *   person who pressed the button.
 *   `runBroadcastTick` runs from cron. It claims a small batch, sends it slowly,
 *   and stops. A 300-parent campaign cannot be a single request: a Vercel
 *   function would time out halfway and nobody would know which parents got it.
 *
 * Every send goes out inside `runWithWaLogContext({ origin: 'broadcast' })`, so
 * each message lands in the same transcript a staff member reads at
 * /messages/whatsapp/<phone> without this module writing a single log row.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { prepareBusinessSend } from '@/lib/whatsapp/consent'
import { runWithWaLogContext } from '@/lib/whatsapp/logContext'
import { sendTemplateMessage } from '@/lib/whatsapp'
import { sendTemplateWithQuickReplies } from '@/lib/whatsapp/interactive'
import {
  BROADCAST_TEMPLATES,
  broadcastBodyParams,
  type BroadcastTemplateType,
} from '@/lib/whatsapp/approvedTemplates'
import type { AppLocale } from '@/lib/i18n/locale'
import {
  checkCampaignAllowed,
  classifyMetaError,
  frequencySkip,
  type GuardBlockReason,
  type GuardOrg,
} from './guard'
import { resolveAudience } from './audience'
import { encodeBroadcastStopPayload } from './payloads'
import { categoryOf, type AudienceFilter, type BroadcastType, type SkipReason } from './types'

type Db = ReturnType<typeof createServiceRoleClient>

/** How long a claimed row may sit before another tick may take it. */
const CLAIM_LEASE = '10 minutes'
/** Recipients per tick. Small on purpose — the pauses below dominate the time. */
export const DEFAULT_BATCH = 20
const PAUSE_MIN_MS = 1_200
const PAUSE_MAX_MS = 2_000

const ORG_COLUMNS = `
  id, name, timezone, default_locale,
  whatsapp_phone_number_id, whatsapp_access_token,
  wa_quality_rating, wa_messaging_limit_tier, wa_business_verification_status,
  wa_connected_at, broadcasts_enabled,
  broadcast_quiet_start, broadcast_quiet_end,
  broadcast_max_promo_per_week, broadcast_max_updates_per_week
`

type OrgRow = {
  id: string
  name: string | null
  timezone: string | null
  default_locale: string | null
  whatsapp_phone_number_id: string | null
  whatsapp_access_token: string | null
  wa_quality_rating: string | null
  wa_messaging_limit_tier: string | null
  wa_business_verification_status: string | null
  wa_connected_at: string | null
  broadcasts_enabled: boolean | null
  broadcast_quiet_start: number | null
  broadcast_quiet_end: number | null
  broadcast_max_promo_per_week: number | null
  broadcast_max_updates_per_week: number | null
}

export type CampaignRow = {
  id: string
  organization_id: string
  name: string
  template_type: BroadcastType
  topic: string | null
  message: string | null
  audience: AudienceFilter
  status: string
  scheduled_at: string | null
  student_group_id: string | null
  consecutive_failures: number
  sent_count: number
  skipped_count: number
  failed_count: number
}

/** The org row shaped for the guard, which knows nothing about the database. */
export function toGuardOrg(org: OrgRow, subscriptionLapsed: boolean): GuardOrg {
  return {
    whatsappPhoneNumberId: org.whatsapp_phone_number_id,
    waQualityRating: (org.wa_quality_rating as GuardOrg['waQualityRating']) ?? 'UNKNOWN',
    waMessagingLimitTier: org.wa_messaging_limit_tier,
    waBusinessVerificationStatus: org.wa_business_verification_status,
    waConnectedAt: org.wa_connected_at,
    broadcastsEnabled: org.broadcasts_enabled !== false,
    timezone: org.timezone ?? 'Asia/Jerusalem',
    quietStart: org.broadcast_quiet_start ?? 8,
    quietEnd: org.broadcast_quiet_end ?? 21,
    maxPromoPerWeek: org.broadcast_max_promo_per_week ?? 1,
    maxUpdatesPerWeek: org.broadcast_max_updates_per_week ?? 3,
    subscriptionLapsed,
  }
}

/**
 * Distinct numbers this line has opened a business conversation with in the last
 * 24 hours — the figure Meta's messaging limit is measured against.
 */
export async function countConversationsLast24h(db: Db, orgId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db
    .from('whatsapp_messages')
    .select('phone')
    .eq('organization_id', orgId)
    .eq('direction', 'out')
    .eq('kind', 'template')
    .gte('created_at', since)
  if (error) {
    console.warn('[broadcast] conversation count failed — assuming none', { orgId, error: error.message })
    return 0
  }
  return new Set((data ?? []).map((r) => (r as { phone: string }).phone)).size
}

/** How many broadcasts of this category each of these numbers had in 7 days. */
async function recentSendsByPhone(
  db: Db,
  orgId: string,
  phones: string[],
  category: 'update' | 'promo' | 'invite',
  now: Date
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (phones.length === 0) return counts

  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const promoTypes = ['promo']
  const utilityTypes = ['class_update', 'group_invite']

  const { data, error } = await db
    .from('broadcast_recipients')
    .select('phone, campaign:broadcast_campaigns!inner(template_type)')
    .eq('organization_id', orgId)
    .eq('status', 'sent')
    .gte('sent_at', since)
    .in('phone', phones)
    .in('campaign.template_type', category === 'promo' ? promoTypes : utilityTypes)

  if (error) {
    console.warn('[broadcast] frequency lookup failed — not capping', { orgId, error: error.message })
    return counts
  }

  for (const row of data ?? []) {
    const phone = (row as { phone: string }).phone
    counts.set(phone, (counts.get(phone) ?? 0) + 1)
  }
  return counts
}

export type StartCampaignResult =
  | { ok: true; recipients: number; skipped: number; scheduledFor: string | null }
  | { ok: false; reason: GuardBlockReason }

/**
 * Materialises the audience and puts the campaign in flight.
 *
 * Skipped people are written as rows too, not dropped: the delivery report has
 * to be able to answer "why didn't Dana's mother get this?" a week later.
 */
export async function startCampaign(
  campaignId: string,
  opts: { now?: Date; contentLooksPromotional?: boolean; subscriptionLapsed?: boolean } = {}
): Promise<StartCampaignResult> {
  const db = createServiceRoleClient()
  const now = opts.now ?? new Date()

  const { data: campaign, error: campaignError } = await db
    .from('broadcast_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()
  if (campaignError || !campaign) throw new Error(`startCampaign: campaign ${campaignId} not found`)
  const c = campaign as CampaignRow

  const { data: orgData, error: orgError } = await db
    .from('organizations')
    .select(ORG_COLUMNS)
    .eq('id', c.organization_id)
    .maybeSingle()
  if (orgError || !orgData) throw new Error(`startCampaign: org ${c.organization_id} not found`)
  const org = orgData as OrgRow

  const category = categoryOf(c.template_type)
  const guardOrg = toGuardOrg(org, opts.subscriptionLapsed ?? false)

  const audience = await resolveAudience(c.organization_id, c.audience, c.template_type, {
    fallbackLocale: (org.default_locale as AppLocale) ?? 'he',
  })

  const decision = checkCampaignAllowed({
    org: guardOrg,
    category,
    recipientCount: audience.included.length,
    conversationsLast24h: await countConversationsLast24h(db, c.organization_id, now),
    now,
    contentLooksPromotional: opts.contentLooksPromotional,
  })

  if (!decision.ok) {
    await db
      .from('broadcast_campaigns')
      .update({ status: 'failed', paused_reason: decision.reason })
      .eq('id', campaignId)
    return { ok: false, reason: decision.reason }
  }

  // Frequency capping needs the per-phone history, so it happens here rather
  // than inside applyConsent — which stays pure and database-free.
  const phones = audience.included.map((r) => r.phone)
  const history = await recentSendsByPhone(db, c.organization_id, phones, category, now)

  const rows: Array<Record<string, unknown>> = []
  const skippedTally = new Map<SkipReason, number>()
  const tallySkip = (reason: SkipReason) => skippedTally.set(reason, (skippedTally.get(reason) ?? 0) + 1)
  for (const { reason, count } of audience.skipped) skippedTally.set(reason, count)

  let allowed = 0
  for (const recipient of audience.included) {
    const capped = frequencySkip(guardOrg, category, history.get(recipient.phone) ?? 0)
    // Everything past the guard's cap waits for another day rather than
    // spending an allowance that lesson reminders also need.
    const overCap = !capped && allowed >= decision.cap
    const skipReason: SkipReason | null = capped ?? (overCap ? 'over_cap' : null)
    if (skipReason) tallySkip(skipReason)
    else allowed += 1

    rows.push({
      campaign_id: campaignId,
      organization_id: c.organization_id,
      parent_id: recipient.parentId,
      student_id: recipient.studentId,
      phone: recipient.phone,
      display_name: recipient.displayName,
      locale: recipient.locale,
      status: skipReason ? 'skipped' : 'pending',
      skip_reason: skipReason,
      sent_at: skipReason ? now.toISOString() : null,
    })
  }

  if (rows.length > 0) {
    const { error } = await db.from('broadcast_recipients').upsert(rows, {
      onConflict: 'campaign_id,phone',
      ignoreDuplicates: true,
    })
    if (error) throw new Error(`startCampaign: recipients insert failed: ${error.message}`)
  }

  const skippedTotal = [...skippedTally.values()].reduce((a, b) => a + b, 0)
  const scheduledFor = decision.deferUntil ?? (c.scheduled_at ? new Date(c.scheduled_at) : null)
  const future = scheduledFor && scheduledFor.getTime() > now.getTime()

  await db
    .from('broadcast_campaigns')
    .update({
      status: allowed === 0 ? 'sent' : future ? 'scheduled' : 'sending',
      scheduled_at: future ? scheduledFor!.toISOString() : null,
      recipients_total: rows.length,
      skipped_count: skippedTotal,
      started_at: future ? null : now.toISOString(),
      sent_at: allowed === 0 ? now.toISOString() : null,
      paused_reason: null,
    })
    .eq('id', campaignId)

  return {
    ok: true,
    recipients: allowed,
    skipped: skippedTotal,
    scheduledFor: future ? scheduledFor!.toISOString() : null,
  }
}

/** Meta's numeric error code, dug out of the text the senders throw. */
export function metaErrorCode(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err)
  const match = message.match(/"code"\s*:\s*(\d+)/)
  return match ? Number(match[1]) : null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface TickResult {
  claimed: number
  sent: number
  skipped: number
  failed: number
  requeued: number
  stopped: boolean
}

/**
 * One pass of the drain: promote anything due, claim a batch, send it.
 *
 * `immediate` skips the between-message pauses; it exists for tests and for a
 * manual run, never for production traffic.
 */
export async function runBroadcastTick(
  opts: { now?: Date; batch?: number; immediate?: boolean } = {}
): Promise<TickResult> {
  const db = createServiceRoleClient()
  const now = opts.now ?? new Date()
  const result: TickResult = { claimed: 0, sent: 0, skipped: 0, failed: 0, requeued: 0, stopped: false }

  // Scheduled campaigns whose time has come.
  await db
    .from('broadcast_campaigns')
    .update({ status: 'sending', started_at: now.toISOString() })
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())

  const { data: claimed, error } = await db.rpc('claim_broadcast_recipients', {
    p_now: now.toISOString(),
    p_lease: CLAIM_LEASE,
    p_limit: opts.batch ?? DEFAULT_BATCH,
  })
  if (error) throw new Error(`runBroadcastTick: claim failed: ${error.message}`)

  const recipients = (claimed ?? []) as Array<{
    id: string
    campaign_id: string
    organization_id: string
    parent_id: string | null
    phone: string
    locale: string
  }>
  result.claimed = recipients.length
  if (recipients.length === 0) return result

  const campaigns = new Map<string, CampaignRow>()
  const orgs = new Map<string, { org: OrgRow; token: string }>()

  for (const [index, recipient] of recipients.entries()) {
    const campaign = await loadCampaign(db, campaigns, recipient.campaign_id)
    const context = await loadOrg(db, orgs, recipient.organization_id)

    if (!campaign || campaign.status !== 'sending' || !context) {
      // The campaign was paused or cancelled between the claim and now.
      await releaseRecipient(db, recipient.id)
      result.requeued += 1
      continue
    }

    const outcome = await sendOne(db, campaign, context, recipient, now)

    if (outcome === 'sent') result.sent += 1
    else if (outcome === 'skipped') result.skipped += 1
    else if (outcome === 'failed') result.failed += 1
    else {
      result.requeued += 1
      result.stopped = true
      break
    }

    if (!opts.immediate && index < recipients.length - 1) {
      await sleep(PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS))
    }
  }

  await finishCompletedCampaigns(db, [...campaigns.keys()], now)
  return result
}

async function loadCampaign(
  db: Db,
  cache: Map<string, CampaignRow>,
  id: string
): Promise<CampaignRow | null> {
  const cached = cache.get(id)
  if (cached) return cached
  const { data } = await db.from('broadcast_campaigns').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  const row = data as CampaignRow
  cache.set(id, row)
  return row
}

async function loadOrg(
  db: Db,
  cache: Map<string, { org: OrgRow; token: string }>,
  id: string
): Promise<{ org: OrgRow; token: string } | null> {
  const cached = cache.get(id)
  if (cached) return cached
  const { data } = await db.from('organizations').select(ORG_COLUMNS).eq('id', id).maybeSingle()
  const org = data as OrgRow | null
  if (!org?.whatsapp_access_token || !org.whatsapp_phone_number_id) return null
  try {
    const entry = { org, token: decryptToken(org.whatsapp_access_token) }
    cache.set(id, entry)
    return entry
  } catch (err) {
    console.error('[broadcast] token decryption failed', { orgId: id, err })
    return null
  }
}

async function releaseRecipient(db: Db, id: string): Promise<void> {
  await db
    .from('broadcast_recipients')
    .update({ status: 'pending', claimed_at: null })
    .eq('id', id)
}

/** Sends to one recipient and records what happened. */
async function sendOne(
  db: Db,
  campaign: CampaignRow,
  context: { org: OrgRow; token: string },
  recipient: { id: string; parent_id: string | null; phone: string; locale: string },
  now: Date
): Promise<'sent' | 'skipped' | 'failed' | 'retry'> {
  const { org, token } = context
  const phoneNumberId = org.whatsapp_phone_number_id!
  const locale = (recipient.locale as AppLocale) ?? 'he'
  const type = campaign.template_type as BroadcastTemplateType

  // The opt-out check and the one-time welcome notice, exactly as every other
  // business-initiated send does it.
  const gate = await prepareBusinessSend({
    orgId: org.id,
    phone: recipient.phone,
    accessToken: token,
    phoneNumberId,
    locale,
  })
  if (!gate.ok) {
    await markRecipient(db, campaign, recipient.id, { status: 'skipped', skip_reason: 'opted_out' }, now)
    return 'skipped'
  }

  const spec = BROADCAST_TEMPLATES[type]?.[locale] ?? BROADCAST_TEMPLATES[type]?.he
  if (!spec) {
    await markRecipient(
      db,
      campaign,
      recipient.id,
      { status: 'failed', error: `no approved template for ${type}` },
      now
    )
    return 'failed'
  }

  const vars: Record<string, string> = {
    org_name: org.name ?? '',
    topic: campaign.topic ?? '',
    message: campaign.message ?? '',
    group_name: campaign.topic ?? '',
  }
  const bodyParams = broadcastBodyParams(type, locale, vars)

  try {
    await runWithWaLogContext({ orgId: org.id, phone: recipient.phone, origin: 'broadcast' }, async () => {
      if (type === 'group_invite') {
        // The invite code is the URL button's dynamic suffix, not a body param.
        const inviteCode = await groupInviteCode(db, campaign)
        if (!inviteCode) throw new Error('group invite has no invite code')
        await sendTemplateMessage(recipient.phone, token, phoneNumberId, spec.name, spec.languageCode, [
          { type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) },
          {
            type: 'button',
            sub_type: 'url',
            index: 0,
            parameters: [{ type: 'text', text: inviteCode }],
          },
        ])
      } else {
        await sendTemplateWithQuickReplies(
          recipient.phone,
          {
            name: spec.name,
            languageCode: spec.languageCode,
            bodyParams,
            payloads: [encodeBroadcastStopPayload(campaign.id)],
          },
          token,
          phoneNumberId
        )
      }
    })
  } catch (err) {
    const code = metaErrorCode(err)
    const verdict = classifyMetaError(code)

    if (verdict.optOutMarketing && recipient.parent_id) {
      await db
        .from('parents')
        .update({ marketing_opted_out_at: now.toISOString() })
        .eq('id', recipient.parent_id)
    }

    if (verdict.outcome === 'retry') {
      await releaseRecipient(db, recipient.id)
      await bumpFailureStreak(db, campaign, code)
      return 'retry'
    }

    await markRecipient(
      db,
      campaign,
      recipient.id,
      {
        status: verdict.outcome,
        skip_reason: verdict.skipReason,
        error_code: code,
        error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      },
      now
    )
    if (verdict.outcome === 'failed') await bumpFailureStreak(db, campaign, code)
    return verdict.outcome
  }

  await markRecipient(db, campaign, recipient.id, { status: 'sent' }, now)

  if (campaign.template_type === 'group_invite' && campaign.student_group_id && recipient.parent_id) {
    await db.from('student_group_invites').upsert(
      {
        group_id: campaign.student_group_id,
        parent_id: recipient.parent_id,
        organization_id: campaign.organization_id,
        campaign_id: campaign.id,
        sent_at: now.toISOString(),
      },
      { onConflict: 'group_id,parent_id', ignoreDuplicates: true }
    )
  }

  return 'sent'
}

async function groupInviteCode(db: Db, campaign: CampaignRow): Promise<string | null> {
  if (!campaign.student_group_id) return null
  const { data } = await db
    .from('student_groups')
    .select('wa_invite_code')
    .eq('id', campaign.student_group_id)
    .maybeSingle()
  return (data as { wa_invite_code: string | null } | null)?.wa_invite_code ?? null
}

async function markRecipient(
  db: Db,
  campaign: CampaignRow,
  recipientId: string,
  patch: {
    status: 'sent' | 'skipped' | 'failed'
    skip_reason?: SkipReason | null
    error_code?: number | null
    error?: string | null
  },
  now: Date
): Promise<void> {
  await db
    .from('broadcast_recipients')
    .update({ ...patch, sent_at: now.toISOString() })
    .eq('id', recipientId)

  const column =
    patch.status === 'sent' ? 'sent_count' : patch.status === 'skipped' ? 'skipped_count' : 'failed_count'
  const current = campaign[column as 'sent_count' | 'skipped_count' | 'failed_count'] ?? 0
  campaign[column as 'sent_count' | 'skipped_count' | 'failed_count'] = current + 1

  const patchCampaign: Record<string, unknown> = { [column]: current + 1 }
  if (patch.status === 'sent') {
    patchCampaign.consecutive_failures = 0
    campaign.consecutive_failures = 0
  }
  await db.from('broadcast_campaigns').update(patchCampaign).eq('id', campaign.id)
}

/**
 * Three failures in a row is a systemic fault — a revoked token, a template
 * Meta pulled — not bad luck. Stop rather than burn the number on 200 of them.
 */
async function bumpFailureStreak(db: Db, campaign: CampaignRow, code: number | null): Promise<void> {
  const streak = (campaign.consecutive_failures ?? 0) + 1
  campaign.consecutive_failures = streak
  const patch: Record<string, unknown> = { consecutive_failures: streak, last_error_code: code }
  if (streak >= 3) {
    patch.status = 'paused'
    patch.paused_reason = `repeated_failure:${code ?? 'unknown'}`
    campaign.status = 'paused'
  }
  await db.from('broadcast_campaigns').update(patch).eq('id', campaign.id)
}

/** Marks as sent any campaign this tick emptied. */
async function finishCompletedCampaigns(db: Db, campaignIds: string[], now: Date): Promise<void> {
  for (const id of campaignIds) {
    const { count } = await db
      .from('broadcast_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .in('status', ['pending', 'claimed'])

    if ((count ?? 0) === 0) {
      await db
        .from('broadcast_campaigns')
        .update({ status: 'sent', sent_at: now.toISOString() })
        .eq('id', id)
        .eq('status', 'sending')
    }
  }
}

/** The org-local month a quota is measured in — exported for the usage screens. */
export function currentMonthLabel(timezone: string, now = new Date()): string {
  return DateTime.fromJSDate(now).setZone(timezone).toFormat('yyyy-MM')
}
