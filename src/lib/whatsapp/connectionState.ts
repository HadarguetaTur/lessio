import { cache } from 'react'
/**
 * The one answer to "is WhatsApp working?".
 *
 * Before this module, eight places in the dashboard each derived their own
 * boolean from `whatsapp_phone_number_id != null` — the connections hub badge,
 * the settings page's green check, the setup checklist, the payment and
 * reminders pages, the message-templates banner, the conversation pages. That
 * field only answers "are credentials stored". An expired token, a number Meta
 * restricted, and a healthy number all satisfied it, so all three rendered as
 * one green "מחובר" (UX audit 09.09.2026, findings F1/F7/F21).
 *
 * Everything a customer is shown about WhatsApp now comes from here. The badge,
 * the dashboard banner, the setup checklist and the locked-feature notices all
 * read one `WaState`, so they can no longer disagree with each other.
 *
 * The rules live in `computeWaState`, which is pure and takes a plain row, so
 * the precedence below is testable without a database and without Meta.
 *
 * Never throws: a failed read reads as "not connected" rather than breaking the
 * page it was rendered into.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getEffectiveSaasFeatures } from '@/lib/saas/subscriptions'
import type { SaasFeatures } from '@/lib/saas/types'
import type { AppLocale } from '@/lib/i18n/locale'
import { parseAppLocale } from '@/lib/i18n/locale'
import { isInWarmUp } from './health'
import { getTemplateStatuses } from './templateStatus'
import { builtInTemplateName } from './templateApprovalView'
import { OUT_OF_WINDOW_TYPES } from './submitTemplate'

/**
 * The customer-facing states, in precedence order. Exactly one is true at a
 * time, and each one maps to a single sentence and at most one action.
 *
 * `active` is the ONLY state a surface may paint green. That is the whole point
 * of the module: green means operational, not "a row exists".
 */
export type WaState =
  /** No number has been connected. */
  | 'not_connected'
  /** The org's plan does not include WhatsApp. Nothing is wrong; it is not sold to them. */
  | 'plan_locked'
  /** Credentials are stored but Meta rejects them. Nothing sends or arrives. */
  | 'reconnect_required'
  /** Meta restricted, disabled or flagged the account. */
  | 'blocked_by_meta'
  /** Quality is RED: sending still works, the cap is about to fall. */
  | 'at_risk'
  /** Works, but not everything: warm-up, unverified business, unapproved templates. */
  | 'limited'
  /** Connected, credentials valid, quality fine, templates approved. */
  | 'active'

/** Why a state is what it is. Rendered as supporting lines, never on its own. */
export type WaReason =
  | 'token_invalid'
  | 'unreachable'
  | 'restricted'
  | 'quality_red'
  | 'quality_yellow'
  | 'warm_up'
  | 'verification_pending'
  | 'unverified_business'
  | 'templates_unapproved'

/** Reasons the customer must act on. Everything else is "waiting, no action needed". */
const ACTIONABLE_REASONS: ReadonlySet<WaReason> = new Set<WaReason>([
  'unverified_business',
  'quality_yellow',
])

/** The organizations columns this module reads. Keep in sync with WA_STATE_COLUMNS. */
export type WaStateRow = {
  whatsapp_phone_number_id: string | null
  wa_health_error: string | null
  wa_account_restricted: boolean | null
  wa_quality_rating: string | null
  wa_business_verification_status: string | null
  wa_connected_at: string | null
  wa_health_checked_at: string | null
  wa_display_phone_number: string | null
  wa_verified_name: string | null
}

/** The select list for WaStateRow, so callers that already read the org can reuse it. */
export const WA_STATE_COLUMNS =
  'whatsapp_phone_number_id, wa_health_error, wa_account_restricted, wa_quality_rating, ' +
  'wa_business_verification_status, wa_connected_at, wa_health_checked_at, ' +
  'wa_display_phone_number, wa_verified_name'

export type WaConnectionState = {
  state: WaState
  reasons: WaReason[]
  /**
   * True when the customer has something to do. False means "waiting on Meta,
   * nothing for you to do" — which is the distinction the audit found missing
   * everywhere, and which every status surface must state explicitly.
   */
  needsAction: boolean
  /** When Meta was last asked. Null when it never has been. */
  lastCheckedAt: string | null
  /** The number a human recognises, cached from Meta. Null before the first health read. */
  displayPhoneNumber: string | null
  /** The business name parents see as the sender. */
  verifiedName: string | null
  /** True for every state in which a number is stored — including broken ones. */
  hasNumber: boolean
}

export type ComputeOptions = {
  planHasWhatsApp: boolean
  /**
   * Whether at least one out-of-window message type still lacks Meta approval.
   * Undefined means "not checked" and never contributes a reason — the banner
   * skips the extra query because it does not render `limited` anyway.
   */
  templatesUnapproved?: boolean
  now?: Date
}

/**
 * The rules. Pure, so the precedence table is a unit test rather than a hope.
 *
 * Precedence is worst-first, and plan comes before everything: an org that was
 * never sold WhatsApp should be told that, not shown a broken connection it has
 * no way and no reason to fix.
 */
export function computeWaState(
  row: WaStateRow | null,
  opts: ComputeOptions
): WaConnectionState {
  const base = {
    lastCheckedAt: row?.wa_health_checked_at ?? null,
    displayPhoneNumber: row?.wa_display_phone_number ?? null,
    verifiedName: row?.wa_verified_name ?? null,
    hasNumber: Boolean(row?.whatsapp_phone_number_id),
  }

  if (!opts.planHasWhatsApp) {
    return { ...base, state: 'plan_locked', reasons: [], needsAction: true }
  }

  if (!row?.whatsapp_phone_number_id) {
    return { ...base, state: 'not_connected', reasons: [], needsAction: true }
  }

  // Terminal: Meta refuses the stored credentials, so nothing sends or arrives.
  // Distinguished from 'unreachable' at the point of the failed read — a Graph
  // 190 is permanent until the owner reconnects, a 500 is not.
  if (row.wa_health_error === 'token_invalid') {
    return { ...base, state: 'reconnect_required', reasons: ['token_invalid'], needsAction: true }
  }

  if (row.wa_account_restricted === true) {
    return { ...base, state: 'blocked_by_meta', reasons: ['restricted'], needsAction: true }
  }

  const quality = (row.wa_quality_rating ?? '').toUpperCase()
  if (quality === 'RED') {
    return { ...base, state: 'at_risk', reasons: ['quality_red'], needsAction: true }
  }

  // Everything below is a working number that cannot yet do everything.
  const reasons: WaReason[] = []

  if (quality === 'YELLOW') reasons.push('quality_yellow')
  if (isInWarmUp(row.wa_connected_at, opts.now)) reasons.push('warm_up')

  const verification = (row.wa_business_verification_status ?? '').toLowerCase()
  if (verification === 'pending') reasons.push('verification_pending')
  else if (verification !== 'verified') reasons.push('unverified_business')

  if (opts.templatesUnapproved === true) reasons.push('templates_unapproved')

  // A transient Meta outage is worth saying out loud — the numbers on screen are
  // stale — but it is not a broken connection and must never read as one.
  if (row.wa_health_error === 'unreachable') reasons.push('unreachable')

  if (reasons.length === 0) {
    return { ...base, state: 'active', reasons: [], needsAction: false }
  }

  return {
    ...base,
    state: 'limited',
    reasons,
    needsAction: reasons.some((r) => ACTIONABLE_REASONS.has(r)),
  }
}

/** True when any out-of-window message type has no approved Meta template. */
export function hasUnapprovedOutOfWindowTemplates(
  rows: Array<{ templateName: string; language: string; status: string; type: string | null }>,
  locale: AppLocale
): boolean {
  return OUT_OF_WINDOW_TYPES.some((type) => {
    // Lessio's own registered template for this type, in this language.
    const builtIn = builtInTemplateName(type, locale)
    const builtInApproved =
      builtIn !== null &&
      rows.some(
        (r) => r.templateName === builtIn && r.language === locale && r.status === 'APPROVED'
      )
    if (builtInApproved) return false

    // An org that submitted its own wording and had it approved is covered too —
    // that is what sendSmart prefers, so the built-in's status is irrelevant.
    const customApproved = rows.some(
      (r) => r.type === type && r.language === locale && r.status === 'APPROVED'
    )
    return !customApproved
  })
}

/**
 * The org's state, read from the database.
 *
 * `checkTemplates` costs one extra query and can only ever turn `active` into
 * `limited`, so callers that do not render `limited` (the dashboard banner)
 * leave it off. Callers that explain the state in full (settings, hub) turn it
 * on.
 *
 * `features` is accepted so a caller that already resolved the plan — the
 * dashboard layout does, for the sidebar — does not resolve it twice.
 */
async function getWaConnectionStateUncached(
  orgId: string,
  opts: { checkTemplates?: boolean; features?: SaasFeatures } = {}
): Promise<WaConnectionState> {
  const db = createServiceRoleClient()

  const [orgResult, features] = await Promise.all([
    db
      .from('organizations')
      .select(`${WA_STATE_COLUMNS}, default_locale`)
      .eq('id', orgId)
      .maybeSingle(),
    opts.features ? Promise.resolve(opts.features) : getEffectiveSaasFeatures(orgId),
  ])

  const row = (orgResult.data ?? null) as (WaStateRow & { default_locale: string | null }) | null

  if (orgResult.error) {
    console.error('[whatsapp/connectionState] Org read failed', {
      orgId,
      error: orgResult.error.message,
    })
  }

  const first = computeWaState(row, { planHasWhatsApp: features.whatsapp_automation })

  // Only `active` can be downgraded by the template check, so skip the query in
  // every other state — including the ones the dashboard banner cares about.
  if (!opts.checkTemplates || first.state !== 'active') return first

  const statuses = await getTemplateStatuses(orgId)
  const templatesUnapproved = hasUnapprovedOutOfWindowTemplates(
    statuses,
    parseAppLocale(row?.default_locale ?? undefined)
  )

  return computeWaState(row, {
    planHasWhatsApp: features.whatsapp_automation,
    templatesUnapproved,
  })
}

/** Per-request memo of {@link getWaConnectionStateUncached}: one read per render, however many callers. */
export const getWaConnectionState = cache(getWaConnectionStateUncached)
