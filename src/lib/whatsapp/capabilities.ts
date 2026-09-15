/**
 * What this org's WhatsApp can do right now — one answer for every screen.
 *
 * The 14.09 review found the product saying "active with limits" and nothing
 * else, and the owner concluding that lists were locked for thirty days. Each
 * surface had been deriving its own partial answer: the nav from the role, the
 * pages from the plan, the composer from a verification flag it half-read, the
 * guard from the phone-health snapshot. This module asks all of those once and
 * hands every surface the same five verdicts, each with the reason a person can
 * act on, the thing that unlocks it, and — where there is one — the date.
 *
 * Deliberately built on top of the existing sources rather than beside them:
 * `computeWaState` for the number, `checkCampaignAllowed` for what a campaign
 * would be told, the plan features for what was sold. Nothing here re-derives a
 * rule; it only reads them together.
 */

import { cache } from 'react'
import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getEffectiveSaasFeatures } from '@/lib/saas/subscriptions'
import type { SaasFeatures } from '@/lib/saas/types'
import { getWaConnectionState, type WaConnectionState } from './connectionState'
import {
  checkCampaignAllowed,
  nextDailyWindow,
  type GuardBlockReason,
  type GuardOrg,
} from './broadcast/guard'
import { GUARD_ORG_COLUMNS, toGuardOrg, type GuardOrgRow } from './broadcast/send'
import { isInWarmUp, WARM_UP_DAYS } from './health'

export type WaCapabilityKey =
  /** Reading and replying inside the 24h window. */
  | 'conversations'
  /** class_update broadcasts, and the closed-window send from a thread. */
  | 'service_updates'
  /** promo broadcasts. */
  | 'promo_broadcasts'
  /** Creating and editing saved lists. */
  | 'lists'
  /** Linking a WhatsApp group to a student group and inviting its parents. */
  | 'linked_groups'

export const WA_CAPABILITY_KEYS: readonly WaCapabilityKey[] = [
  'conversations',
  'service_updates',
  'promo_broadcasts',
  'lists',
  'linked_groups',
]

export type WaCapabilityStatus = 'available' | 'limited' | 'locked'

/** Why a capability is closed. Each maps to a title, a body, an unlock and a signal. */
export type WaLockReason =
  | 'role'
  | 'plan_whatsapp'
  | 'plan_broadcasts'
  | 'subscription_lapsed'
  | 'not_connected'
  | 'reconnect_required'
  | 'blocked_by_meta'
  | 'quality_red'
  | 'broadcasts_disabled'
  | 'business_unverified'
  | 'verification_pending'
  | 'no_daily_budget'

/** Why a capability works but not fully. */
export type WaLimitReason =
  | 'warm_up'
  | 'unproven_tier'
  | 'quality_yellow'
  | 'capped_by_budget'
  | 'templates_unapproved'
  | 'unreachable'

export type WaCapabilityReason = WaLockReason | WaLimitReason

export const ALL_CAPABILITY_REASONS: readonly WaCapabilityReason[] = [
  'role',
  'plan_whatsapp',
  'plan_broadcasts',
  'subscription_lapsed',
  'not_connected',
  'reconnect_required',
  'blocked_by_meta',
  'quality_red',
  'broadcasts_disabled',
  'business_unverified',
  'verification_pending',
  'no_daily_budget',
  'warm_up',
  'unproven_tier',
  'quality_yellow',
  'capped_by_budget',
  'templates_unapproved',
  'unreachable',
]

/** What opens it. Drives the dialog's button — or its absence. */
export type WaUnlock =
  | 'upgrade_plan'
  | 'renew_subscription'
  | 'connect_number'
  | 'reconnect_number'
  | 'verify_business'
  | 'approve_templates'
  | 'wait_until'
  | 'wait_meta'
  | 'ask_owner'
  | 'none'

export const ALL_UNLOCKS: readonly WaUnlock[] = [
  'upgrade_plan',
  'renew_subscription',
  'connect_number',
  'reconnect_number',
  'verify_business',
  'approve_templates',
  'wait_until',
  'wait_meta',
  'ask_owner',
  'none',
]

export type WaCapability = {
  key: WaCapabilityKey
  status: WaCapabilityStatus
  /** The one reason the dialog leads with, worst first. Null when available. */
  reason: WaCapabilityReason | null
  /** Every applicable reason, worst first — the status strip lists them. */
  reasons: WaCapabilityReason[]
  unlock: WaUnlock
  /** Where the unlock button goes. Null when there is nothing to press. */
  unlockHref: string | null
  /** ISO instant. Set for warm-up (connected + 14d) and for a spent daily budget (tomorrow). */
  until: string | null
  /** Recipients per campaign while limited. Null when not capped. */
  cap: number | null
}

export type WaCapabilities = {
  connection: WaConnectionState
  timezone: string
  byKey: Record<WaCapabilityKey, WaCapability>
}

export type CapabilityInput = {
  connection: WaConnectionState
  guardOrg: GuardOrg
  features: Pick<SaasFeatures, 'whatsapp_automation' | 'broadcasts'>
  role: string
  isSaasReadOnly: boolean
  /**
   * Distinct numbers messaged in the last 24h. Only the composer supplies it;
   * everywhere else the daily budget is not a thing to lock a page over, so it
   * is left out and the budget rules are skipped.
   */
  conversationsLast24h?: number
  /** Meta Security Centre for this business — the only place verification happens. */
  securityCentreUrl: string
  now: Date
}

/** The shape a client component receives: serialisable, date already a label. */
export type LockedFeatureInfo = {
  key: WaCapabilityKey
  status: WaCapabilityStatus
  reason: WaCapabilityReason | null
  unlock: WaUnlock
  unlockHref: string | null
  cap: number | null
  /** `until` formatted for the org's timezone, e.g. "28.09". */
  untilLabel: string | null
}

const SETTINGS_WHATSAPP = '/settings/whatsapp'
const SETTINGS_TEMPLATES = '/settings/message-templates'

function available(key: WaCapabilityKey): WaCapability {
  return {
    key,
    status: 'available',
    reason: null,
    reasons: [],
    unlock: 'none',
    unlockHref: null,
    until: null,
    cap: null,
  }
}

/** Unlock and destination for a reason. One row per reason, no exceptions. */
function unlockFor(
  reason: WaCapabilityReason,
  input: Pick<CapabilityInput, 'securityCentreUrl'>
): { unlock: WaUnlock; href: string | null } {
  switch (reason) {
    case 'role':
    case 'broadcasts_disabled':
      return { unlock: 'ask_owner', href: null }
    case 'plan_whatsapp':
      return { unlock: 'upgrade_plan', href: '/account/billing?upgrade=whatsapp_automation' }
    case 'plan_broadcasts':
      return { unlock: 'upgrade_plan', href: '/account/billing?upgrade=broadcasts' }
    case 'subscription_lapsed':
      return { unlock: 'renew_subscription', href: '/account/billing?reason=past_due_locked' }
    case 'not_connected':
      return { unlock: 'connect_number', href: SETTINGS_WHATSAPP }
    case 'reconnect_required':
      return { unlock: 'reconnect_number', href: SETTINGS_WHATSAPP }
    case 'business_unverified':
      return { unlock: 'verify_business', href: input.securityCentreUrl }
    case 'templates_unapproved':
      return { unlock: 'approve_templates', href: SETTINGS_TEMPLATES }
    case 'no_daily_budget':
    case 'warm_up':
    case 'capped_by_budget':
      return { unlock: 'wait_until', href: null }
    case 'blocked_by_meta':
    case 'quality_red':
    case 'quality_yellow':
    case 'verification_pending':
    case 'unproven_tier':
      return { unlock: 'wait_meta', href: null }
    case 'unreachable':
      return { unlock: 'none', href: null }
  }
}

function lockedBy(
  key: WaCapabilityKey,
  reason: WaLockReason,
  input: CapabilityInput,
  until: string | null = null
): WaCapability {
  const { unlock, href } = unlockFor(reason, input)
  return { key, status: 'locked', reason, reasons: [reason], unlock, unlockHref: href, until, cap: null }
}

/** A working capability with things worth saying about it, worst first. */
function limitedBy(
  key: WaCapabilityKey,
  reasons: WaCapabilityReason[],
  input: CapabilityInput,
  extra: { until?: string | null; cap?: number | null } = {}
): WaCapability {
  const lead = reasons[0]
  const { unlock, href } = unlockFor(lead, input)
  return {
    key,
    status: 'limited',
    reason: lead,
    reasons,
    unlock,
    unlockHref: href,
    until: extra.until ?? null,
    cap: extra.cap ?? null,
  }
}

/**
 * A guard refusal, translated into the reason a person can act on.
 *
 * The guard says `promo_needs_verification` for both "never started" and
 * "Meta is still looking"; those are different sentences with different
 * buttons, and the connection state knows which one it is.
 */
function guardBlockToReason(
  reason: GuardBlockReason,
  connection: WaConnectionState
): WaLockReason | null {
  switch (reason) {
    case 'not_connected':
    case 'reconnect_required':
    case 'blocked_by_meta':
    case 'quality_red':
    case 'broadcasts_disabled':
    case 'subscription_lapsed':
    case 'no_daily_budget':
      return reason
    case 'promo_needs_verification':
      return connection.reasons.includes('verification_pending')
        ? 'verification_pending'
        : 'business_unverified'
    // Per-campaign inputs the resolver never supplies; they stay post-submit.
    case 'promotional_content_in_update':
    case 'template_paused':
      return null
  }
}

/** The verdict for a broadcast category, straight from the guard. */
function broadcastVerdict(
  key: 'service_updates' | 'promo_broadcasts',
  category: 'update' | 'promo',
  input: CapabilityInput
): WaCapability {
  const { guardOrg, connection, now } = input
  const budgetKnown = input.conversationsLast24h !== undefined
  // A large synthetic audience, so the cap the guard returns is the rule's cap
  // and not the audience's size.
  const decision = checkCampaignAllowed({
    org: guardOrg,
    category,
    recipientCount: 100_000,
    conversationsLast24h: input.conversationsLast24h ?? 0,
    now,
  })

  if (!decision.ok) {
    const reason = guardBlockToReason(decision.reason, connection)
    if (reason === null) return available(key)
    // With the synthetic 0 the guard cannot spend a budget; said explicitly
    // rather than relied on.
    if (reason === 'no_daily_budget' && !budgetKnown) return available(key)
    const until =
      reason === 'no_daily_budget'
        ? nextDailyWindow(now, guardOrg.timezone, guardOrg.quietStart).toISOString()
        : null
    return lockedBy(key, reason, input, until)
  }

  const reasons: WaLimitReason[] = []
  let until: string | null = null

  for (const warning of decision.warnings) {
    if (warning === 'quality_yellow') reasons.push('quality_yellow')
    if (warning === 'warm_up') {
      // The guard's `warm_up` covers two facts with two different answers: a
      // new number opens by itself on a date; a low tier opens when Meta says.
      if (guardOrg.waConnectedAt && isInWarmUp(guardOrg.waConnectedAt, now)) {
        reasons.push('warm_up')
        until = DateTime.fromISO(guardOrg.waConnectedAt).plus({ days: WARM_UP_DAYS }).toISO()
      } else {
        reasons.push('unproven_tier')
      }
    }
    if (warning === 'capped_by_budget' && budgetKnown) {
      reasons.push('capped_by_budget')
      until = until ?? nextDailyWindow(now, guardOrg.timezone, guardOrg.quietStart).toISOString()
    }
  }
  const cap = reasons.length > 0 ? decision.cap : null

  if (key === 'service_updates' && connection.reasons.includes('templates_unapproved')) {
    reasons.push('templates_unapproved')
  }
  if (connection.reasons.includes('unreachable')) reasons.push('unreachable')

  if (reasons.length === 0) return available(key)
  return limitedBy(key, reasons, input, { until, cap })
}

/**
 * The rules. Pure, so every row of the matrix is a unit test.
 *
 * Precedence, worst first: who you are, what you bought, whether you paid,
 * then what the number itself can do. An owner on a plan without broadcasts
 * is told that — not that her number is new — because that is the sentence
 * that changes what she does next.
 */
export function computeWaCapabilities(
  input: CapabilityInput
): Record<WaCapabilityKey, WaCapability> {
  const { connection, features, role, isSaasReadOnly } = input
  const staffOnly: readonly WaCapabilityKey[] = ['lists', 'promo_broadcasts', 'linked_groups']

  const out = {} as Record<WaCapabilityKey, WaCapability>

  for (const key of WA_CAPABILITY_KEYS) {
    if (role === 'teacher' && staffOnly.includes(key)) {
      out[key] = lockedBy(key, 'role', input)
      continue
    }
    if (!features.whatsapp_automation) {
      out[key] = lockedBy(key, 'plan_whatsapp', input)
      continue
    }
    if (!features.broadcasts && key !== 'conversations') {
      out[key] = lockedBy(key, 'plan_broadcasts', input)
      continue
    }

    switch (key) {
      case 'lists':
        // A list is a database row, not a message: it needs no number. Sending
        // to it is `service_updates`, judged on its own.
        out[key] = isSaasReadOnly ? lockedBy(key, 'subscription_lapsed', input) : available(key)
        break

      case 'conversations':
        if (connection.state === 'not_connected') {
          out[key] = lockedBy(key, 'not_connected', input)
        } else if (connection.state === 'reconnect_required') {
          out[key] = lockedBy(key, 'reconnect_required', input)
        } else if (isSaasReadOnly) {
          out[key] = limitedBy(key, ['subscription_lapsed'], input)
        } else if (connection.state === 'blocked_by_meta') {
          out[key] = limitedBy(key, ['blocked_by_meta'], input)
        } else if (connection.reasons.includes('unreachable')) {
          out[key] = limitedBy(key, ['unreachable'], input)
        } else {
          out[key] = available(key)
        }
        break

      case 'service_updates':
        out[key] = broadcastVerdict(key, 'update', input)
        break

      case 'promo_broadcasts':
        out[key] = broadcastVerdict(key, 'promo', input)
        break

      case 'linked_groups': {
        // An invite is a campaign of the update category, so the group card
        // inherits what an update is told — minus the template note, which is
        // about class_update wording and not about invitations.
        const base = out.service_updates
        if (base.status !== 'limited') {
          out[key] = { ...base, key }
        } else {
          const reasons = base.reasons.filter((r) => r !== 'templates_unapproved')
          out[key] =
            reasons.length === 0
              ? available(key)
              : limitedBy(key, reasons, input, { until: base.until, cap: base.cap })
        }
        break
      }
    }
  }

  return out
}

/** The Security Centre for this business, or Meta's generic entry when the id is unknown. */
export function securityCentreUrl(businessId: string | null | undefined): string {
  return businessId
    ? `https://business.facebook.com/settings/security?business_id=${businessId}`
    : 'https://business.facebook.com/settings/security'
}

/** `until` as the short date a person reads, in the org's zone. */
export function formatUntil(until: string | null, timezone: string, locale: string): string | null {
  if (!until) return null
  const dt = DateTime.fromISO(until).setZone(timezone).setLocale(locale)
  return dt.isValid ? dt.toFormat('dd.MM') : null
}

/** What a client component gets: the verdict, with the date already a label. */
export function toLockedInfo(cap: WaCapability, timezone: string, locale: string): LockedFeatureInfo {
  return {
    key: cap.key,
    status: cap.status,
    reason: cap.reason,
    unlock: cap.unlock,
    unlockHref: cap.unlockHref,
    cap: cap.cap,
    untilLabel: formatUntil(cap.until, timezone, locale),
  }
}

const EMPTY_GUARD_ROW: GuardOrgRow = {
  timezone: null,
  whatsapp_phone_number_id: null,
  wa_quality_rating: null,
  wa_messaging_limit_tier: null,
  wa_business_verification_status: null,
  wa_connected_at: null,
  wa_health_error: null,
  wa_account_restricted: null,
  broadcasts_enabled: null,
  broadcast_quiet_start: null,
  broadcast_quiet_end: null,
  broadcast_max_promo_per_week: null,
  broadcast_max_updates_per_week: null,
}

type OrgCapabilityRow = GuardOrgRow & { whatsapp_business_id: string | null }

async function getWaCapabilitiesUncached(
  orgId: string,
  session: { role: string; isSaasReadOnly?: boolean },
  opts: { conversationsLast24h?: number; checkTemplates?: boolean } = {}
): Promise<WaCapabilities> {
  const db = createServiceRoleClient()
  const features = await getEffectiveSaasFeatures(orgId)

  const [connection, orgResult] = await Promise.all([
    getWaConnectionState(orgId, { checkTemplates: opts.checkTemplates ?? true, features }),
    db
      .from('organizations')
      .select(`${GUARD_ORG_COLUMNS}, whatsapp_business_id`)
      .eq('id', orgId)
      .maybeSingle(),
  ])

  if (orgResult.error) {
    console.error('[whatsapp/capabilities] Org read failed', {
      orgId,
      error: orgResult.error.message,
    })
  }

  // A failed read must not throw out of a layout. Without the row the guard
  // sees no number, which is the honest fallback: nothing can be sent.
  const row = (orgResult.data ?? null) as OrgCapabilityRow | null
  const isSaasReadOnly = session.isSaasReadOnly === true
  const guardOrg = toGuardOrg(row ?? EMPTY_GUARD_ROW, isSaasReadOnly)

  const byKey = computeWaCapabilities({
    connection,
    guardOrg,
    features,
    role: session.role,
    isSaasReadOnly,
    conversationsLast24h: opts.conversationsLast24h,
    securityCentreUrl: securityCentreUrl(row?.whatsapp_business_id),
    now: new Date(),
  })

  return { connection, timezone: guardOrg.timezone, byKey }
}

/** Per-request memo: the layout, the page and the rail all ask, one read answers. */
export const getWaCapabilities = cache(getWaCapabilitiesUncached)
