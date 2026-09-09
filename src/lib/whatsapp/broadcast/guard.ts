/**
 * The single place that decides whether a broadcast may go out.
 *
 * Every broadcast-shaped send passes through here — the compose screen calls it
 * to show what will happen, and the sender calls it again before the first
 * message. The rules exist to protect one thing that cannot be bought back: the
 * org's WhatsApp number. Meta lowers a number's quality rating on blocks and
 * reports, then lowers its daily tier, then pauses its templates, and a number
 * that reaches RED stops carrying lesson reminders and payment requests too.
 *
 * Deliberately pure: it takes the org row, the counts and the clock, and returns
 * a decision. The database reads live in the caller so this file can be tested
 * as a table.
 */

import { DateTime } from 'luxon'
import { isInWarmUp, tierDailyLimit, type WaQualityRating } from '@/lib/whatsapp/health'
import type { BroadcastCategory, SkipReason } from './types'

/** Why a whole campaign is refused. Each maps to a sentence in the UI. */
export type GuardBlockReason =
  | 'not_connected'
  | 'reconnect_required'
  | 'blocked_by_meta'
  | 'quality_red'
  | 'broadcasts_disabled'
  | 'subscription_lapsed'
  | 'no_daily_budget'
  | 'promo_needs_verification'
  | 'promotional_content_in_update'
  | 'template_paused'

export type GuardWarning = 'quality_yellow' | 'warm_up' | 'capped_by_budget' | 'outside_quiet_hours'

export interface GuardOrg {
  whatsappPhoneNumberId: string | null
  /**
   * Why the last read of Meta failed, if it did (`organizations.wa_health_error`).
   * 'token_invalid' means the credentials are dead: a campaign launched on them
   * would march through the whole audience marking every row failed, and burn
   * the campaign's one shot at those recipients.
   */
  waHealthError: 'token_invalid' | 'unreachable' | null
  /** Meta has restricted or disabled the account. Sending is not available. */
  waAccountRestricted: boolean
  waQualityRating: WaQualityRating | null
  waMessagingLimitTier: string | null
  waBusinessVerificationStatus: string | null
  waConnectedAt: string | null
  broadcastsEnabled: boolean
  timezone: string
  quietStart: number
  quietEnd: number
  maxPromoPerWeek: number
  maxUpdatesPerWeek: number
  subscriptionLapsed: boolean
}

export interface GuardInput {
  org: GuardOrg
  category: BroadcastCategory
  recipientCount: number
  /** Distinct numbers this line has opened a business conversation with in the last 24h. */
  conversationsLast24h: number
  now: Date
  /** Set when an AI or heuristic check says the text of an `update` is promotional. */
  contentLooksPromotional?: boolean
  templatePaused?: boolean
}

export type GuardDecision =
  | {
      ok: true
      /** Maximum recipients this campaign may address now. */
      cap: number
      warnings: GuardWarning[]
      /** Non-null when quiet hours push the campaign to a later start. */
      deferUntil: Date | null
    }
  | { ok: false; reason: GuardBlockReason }

/** Recipients allowed per campaign while a number is still unproven. */
export const WARM_UP_CAMPAIGN_CAP = 50
/** Recipients allowed per campaign while quality is YELLOW. */
export const YELLOW_CAMPAIGN_CAP = 100
/** A tier at or below this counts as an unproven number. */
export const UNPROVEN_TIER_LIMIT = 250
/** Share of the remaining daily allowance a single campaign may take. */
export const DAILY_BUDGET_SHARE = 0.5

/**
 * The next moment inside the org's sending window, or null if `now` already is.
 *
 * Quiet hours defer rather than refuse: an owner writing an announcement at
 * 23:00 wants it sent, just not at 23:00.
 */
export function nextSendableTime(
  now: Date,
  timezone: string,
  quietStart: number,
  quietEnd: number
): Date | null {
  const local = DateTime.fromJSDate(now).setZone(timezone)
  if (!local.isValid) return null
  const hour = local.hour
  if (hour >= quietStart && hour < quietEnd) return null

  const target =
    hour < quietStart
      ? local.set({ hour: quietStart, minute: 0, second: 0, millisecond: 0 })
      : local.plus({ days: 1 }).set({ hour: quietStart, minute: 0, second: 0, millisecond: 0 })

  return target.toJSDate()
}

/**
 * How many messages this line may still start today, and half of that as the
 * campaign's share — the other half is reserved so a big announcement cannot
 * starve tomorrow morning's lesson reminders.
 */
export function dailyBudget(org: GuardOrg, conversationsLast24h: number): number | null {
  const tier = tierDailyLimit(org.waMessagingLimitTier)
  if (tier === null) return null // tier unknown — do not invent a cap
  if (tier === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
  const remaining = Math.max(0, tier - conversationsLast24h)
  return Math.floor(remaining * DAILY_BUDGET_SHARE)
}

export function checkCampaignAllowed(input: GuardInput): GuardDecision {
  const { org, category, recipientCount, now } = input

  if (!org.whatsappPhoneNumberId) return { ok: false, reason: 'not_connected' }
  // Ahead of every other rule for the same reason `not_connected` is: these two
  // mean no message can leave at all, so running the campaign would only spend
  // the audience and fill the report with failures. 'unreachable' deliberately
  // does not block — a slow Graph read is not a broken line.
  if (org.waHealthError === 'token_invalid') return { ok: false, reason: 'reconnect_required' }
  if (org.waAccountRestricted) return { ok: false, reason: 'blocked_by_meta' }
  if (!org.broadcastsEnabled) return { ok: false, reason: 'broadcasts_disabled' }
  if (org.subscriptionLapsed) return { ok: false, reason: 'subscription_lapsed' }
  if (org.waQualityRating === 'RED') return { ok: false, reason: 'quality_red' }
  if (input.templatePaused) return { ok: false, reason: 'template_paused' }

  // Marketing on an unverified portfolio is the fastest way to lose a number:
  // 250 conversations a day, no track record, and the least welcome category.
  if (category === 'promo' && (org.waBusinessVerificationStatus ?? '').toLowerCase() !== 'verified') {
    return { ok: false, reason: 'promo_needs_verification' }
  }

  // A promotion dressed as a service update is a policy breach whichever way
  // the owner meant it, so it is refused rather than warned about.
  if (category === 'update' && input.contentLooksPromotional) {
    return { ok: false, reason: 'promotional_content_in_update' }
  }

  const warnings: GuardWarning[] = []
  let cap = recipientCount

  if (org.waQualityRating === 'YELLOW') {
    cap = Math.min(cap, YELLOW_CAMPAIGN_CAP)
    warnings.push('quality_yellow')
  }

  const tier = tierDailyLimit(org.waMessagingLimitTier)
  const unproven = isInWarmUp(org.waConnectedAt, now) || (tier !== null && tier <= UNPROVEN_TIER_LIMIT)
  if (unproven) {
    cap = Math.min(cap, WARM_UP_CAMPAIGN_CAP)
    warnings.push('warm_up')
  }

  const budget = dailyBudget(org, input.conversationsLast24h)
  if (budget !== null && budget < cap) {
    if (budget <= 0) return { ok: false, reason: 'no_daily_budget' }
    cap = budget
    warnings.push('capped_by_budget')
  }

  const deferUntil = nextSendableTime(now, org.timezone, org.quietStart, org.quietEnd)
  if (deferUntil) warnings.push('outside_quiet_hours')

  return { ok: true, cap, warnings, deferUntil }
}

/**
 * Per-recipient frequency capping, applied after consent.
 *
 * `sentInLastWeek` is how many broadcasts of this category that number already
 * received in the past 7 days. The ceiling is the org's own setting, so a studio
 * that talks to its parents weekly can raise it and a quiet one can drop it.
 */
export function frequencySkip(
  org: GuardOrg,
  category: BroadcastCategory,
  sentInLastWeek: number
): SkipReason | null {
  const max = category === 'promo' ? org.maxPromoPerWeek : org.maxUpdatesPerWeek
  return sentInLastWeek >= max ? 'frequency_capped' : null
}

/**
 * What Meta's error code means for this recipient and for the rest of the tick.
 *
 * `retry` puts the row back in the queue untouched — nothing is wrong with the
 * message, the line is simply busy — and `stopRun` ends the tick, because a
 * throughput error applies just as much to every message behind it.
 */
export function classifyMetaError(code: number | null): {
  outcome: 'skipped' | 'failed' | 'retry'
  skipReason: SkipReason | null
  stopRun: boolean
  optOutMarketing: boolean
} {
  switch (code) {
    // Per-user marketing cap: this person has had enough marketing today from
    // every business combined. Not a failure of ours, and Meta's own guidance
    // is not to retry for 24h — so it is a skip, not a requeue.
    case 131049:
      return { outcome: 'skipped', skipReason: 'per_user_limit', stopRun: false, optOutMarketing: false }
    // The recipient told Meta they want no marketing from this business.
    case 131050:
      return { outcome: 'skipped', skipReason: 'marketing_opted_out', stopRun: false, optOutMarketing: true }
    // Rate limit / throughput: the message is fine, the line is saturated.
    case 130429:
    case 131056:
    case 80007:
      return { outcome: 'retry', skipReason: null, stopRun: true, optOutMarketing: false }
    default:
      return { outcome: 'failed', skipReason: null, stopRun: false, optOutMarketing: false }
  }
}
