/**
 * Health of an org's WhatsApp business number, as Meta sees it.
 *
 * Meta rates every number (quality_rating), caps how many business-initiated
 * conversations it may open per 24h (messaging_limit_tier), gates the Groups API
 * behind Official Business Account status, and lifts the 250/day cap only once
 * the business portfolio is verified. All of that lives on `organizations`
 * (migration 20260908150000) and is refreshed from here:
 *
 *   - on connect (saveWhatsAppConnection)
 *   - daily, by /api/internal/whatsapp/health
 *   - before a broadcast campaign starts (Phase 1 guard)
 *
 * The webhooks phone_number_quality_update / account_update push the same
 * columns between refreshes (src/app/api/whatsapp/webhook/route.ts).
 *
 * Never throws on a Meta failure: a health read must not break the settings
 * page or a connection save. It reports why it failed, records that reason on
 * the org (`wa_health_error`) so every surface can tell a dead connection from
 * a transient blip, and leaves the stored snapshot alone.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { META_API_VERSION } from './graphVersion'

export type WaQualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'

/**
 * Why a read of Meta failed. The distinction is the whole reason the audit's
 * first finding was fixable: 'token_invalid' is terminal until the owner
 * reconnects and must be shown as a broken connection, 'unreachable' is a blip
 * and must not be.
 */
export type WaHealthError = 'token_invalid' | 'unreachable'

/** Meta's code for an expired, revoked or otherwise unusable access token. */
const OAUTH_ERROR_CODE = 190

/** Thrown by fetchPhoneHealth so the caller can tell the two failures apart. */
export class PhoneHealthError extends Error {
  constructor(
    public readonly kind: WaHealthError,
    message: string
  ) {
    super(message)
    this.name = 'PhoneHealthError'
  }
}

export interface PhoneHealth {
  qualityRating: WaQualityRating
  /** Meta's tier label, e.g. TIER_250 / TIER_2K / TIER_10K / TIER_100K / TIER_UNLIMITED. */
  messagingLimitTier: string | null
  isOba: boolean
  obaStatus: string | null
  businessVerificationStatus: string | null
  nameStatus: string | null
  /**
   * WABA account_review_status. Meta reliably fires account_update when it
   * restricts an account and does not reliably fire anything when it lifts the
   * restriction, so this is the recovery path: APPROVED here clears the flag.
   */
  accountReviewStatus: string | null
  /** Cached so the hub and the settings page can name the number without a Graph call. */
  displayPhoneNumber: string | null
  verifiedName: string | null
  checkedAt: string
}

/** Business-initiated conversations the tier allows per rolling 24h. */
export function tierDailyLimit(tier: string | null | undefined): number | null {
  switch ((tier ?? '').toUpperCase()) {
    case 'TIER_50':
      return 50
    case 'TIER_250':
      return 250
    case 'TIER_1K':
      return 1_000
    case 'TIER_2K':
      return 2_000
    case 'TIER_10K':
      return 10_000
    case 'TIER_100K':
      return 100_000
    case 'TIER_UNLIMITED':
      return Number.POSITIVE_INFINITY
    default:
      return null
  }
}

/** Numbers connected less than this many days ago are in warm-up. */
export const WARM_UP_DAYS = 14

export function isInWarmUp(connectedAt: string | null | undefined, now = new Date()): boolean {
  if (!connectedAt) return false
  const ms = now.getTime() - new Date(connectedAt).getTime()
  return ms < WARM_UP_DAYS * 24 * 60 * 60 * 1000
}

function normaliseQuality(raw: unknown): WaQualityRating {
  const value = String(raw ?? '').toUpperCase()
  return value === 'GREEN' || value === 'YELLOW' || value === 'RED' ? value : 'UNKNOWN'
}

type PhoneNumberFields = {
  quality_rating?: string
  messaging_limit_tier?: string
  is_official_business_account?: boolean
  official_business_account?: { oba_status?: string } | string
  name_status?: string
  display_phone_number?: string
  verified_name?: string
}

type WabaFields = {
  business_verification_status?: string
  account_review_status?: string
}

/**
 * Classifies a failed Graph response. Meta reports a dead token as error code
 * 190 with an HTTP 400 or 401, so the status alone is not enough — a 400 can
 * equally mean a malformed field list, which is our bug and not a dead
 * connection.
 */
export function classifyGraphFailure(status: number, body: string): WaHealthError {
  if (status === 401) return 'token_invalid'
  try {
    const parsed = JSON.parse(body) as { error?: { code?: number; type?: string } }
    if (parsed.error?.code === OAUTH_ERROR_CODE) return 'token_invalid'
    if (parsed.error?.type === 'OAuthException' && status === 400) return 'token_invalid'
  } catch {
    // Not JSON — fall through to the conservative answer.
  }
  return 'unreachable'
}

/**
 * Reads the number and the WABA at Meta. Exported for the health cron, which
 * already holds the decrypted token; everything else goes through
 * refreshPhoneHealth. Throws {@link PhoneHealthError} on a non-OK response.
 */
export async function fetchPhoneHealth(params: {
  phoneNumberId: string
  wabaId: string | null
  accessToken: string
}): Promise<PhoneHealth> {
  const headers = { Authorization: `Bearer ${params.accessToken}` }

  const phoneRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${params.phoneNumberId}` +
      `?fields=quality_rating,messaging_limit_tier,is_official_business_account,official_business_account,name_status,display_phone_number,verified_name`,
    { headers }
  )
  if (!phoneRes.ok) {
    const body = await phoneRes.text().catch(() => '')
    throw new PhoneHealthError(
      classifyGraphFailure(phoneRes.status, body),
      `Meta phone health read failed: ${phoneRes.status} ${body}`
    )
  }
  const phone = (await phoneRes.json()) as PhoneNumberFields

  let waba: WabaFields = {}
  if (params.wabaId) {
    // The WABA read is secondary: a number can report its health even when the
    // WABA fields are unavailable for this token, so a failure here is logged
    // and the verification status simply stays unknown.
    const wabaRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${params.wabaId}` +
        `?fields=business_verification_status,account_review_status`,
      { headers }
    )
    if (wabaRes.ok) {
      waba = (await wabaRes.json()) as WabaFields
    } else {
      console.warn('[whatsapp/health] WABA read failed', {
        wabaId: params.wabaId,
        status: wabaRes.status,
      })
    }
  }

  const oba = phone.official_business_account
  const obaStatus =
    typeof oba === 'string' ? oba : (oba?.oba_status ?? null)

  return {
    qualityRating: normaliseQuality(phone.quality_rating),
    messagingLimitTier: phone.messaging_limit_tier ?? null,
    isOba: phone.is_official_business_account === true || obaStatus?.toUpperCase() === 'APPROVED',
    obaStatus: obaStatus ?? null,
    businessVerificationStatus: waba.business_verification_status ?? null,
    nameStatus: phone.name_status ?? null,
    accountReviewStatus: waba.account_review_status ?? null,
    displayPhoneNumber: phone.display_phone_number ?? null,
    verifiedName: phone.verified_name ?? null,
    checkedAt: new Date().toISOString(),
  }
}

/**
 * Persists a snapshot on the org. Shared by the refresh and the webhooks.
 *
 * `accountRestricted` and `healthError` are separate from the snapshot fields
 * because they are set from places that know nothing else — the account_update
 * webhook, and a failed read that has no snapshot at all.
 */
export async function storePhoneHealth(
  orgId: string,
  health: Partial<PhoneHealth> & {
    checkedAt: string
    accountRestricted?: boolean
    healthError?: WaHealthError | null
  }
): Promise<void> {
  const db = createServiceRoleClient()
  const patch: Record<string, unknown> = { wa_health_checked_at: health.checkedAt }
  if (health.qualityRating !== undefined) patch.wa_quality_rating = health.qualityRating
  if (health.messagingLimitTier !== undefined) patch.wa_messaging_limit_tier = health.messagingLimitTier
  if (health.isOba !== undefined) patch.wa_is_oba = health.isOba
  if (health.obaStatus !== undefined) patch.wa_oba_status = health.obaStatus
  if (health.businessVerificationStatus !== undefined) {
    patch.wa_business_verification_status = health.businessVerificationStatus
  }
  if (health.nameStatus !== undefined) patch.wa_name_status = health.nameStatus
  if (health.displayPhoneNumber !== undefined) patch.wa_display_phone_number = health.displayPhoneNumber
  if (health.verifiedName !== undefined) patch.wa_verified_name = health.verifiedName
  if (health.accountRestricted !== undefined) patch.wa_account_restricted = health.accountRestricted
  if (health.healthError !== undefined) {
    patch.wa_health_error = health.healthError
    patch.wa_health_error_at = health.healthError ? health.checkedAt : null
  }

  const { error } = await db.from('organizations').update(patch).eq('id', orgId)
  if (error) {
    console.error('[whatsapp/health] Failed to store health', { orgId, error: error.message })
    throw new Error('Failed to store WhatsApp health')
  }
}

/**
 * Records that Meta refuses the org's credentials, from a caller that found out
 * some other way — getPhoneIdentity's live lookup, or a failed send.
 *
 * Never throws: this is always a side note on someone else's operation.
 */
export async function recordHealthError(
  orgId: string,
  kind: WaHealthError
): Promise<void> {
  try {
    const db = createServiceRoleClient()
    await db
      .from('organizations')
      .update({ wa_health_error: kind, wa_health_error_at: new Date().toISOString() })
      .eq('id', orgId)
  } catch (err) {
    console.warn('[whatsapp/health] Could not record health error', { orgId, kind, err })
  }
}

/**
 * Why a refresh did not produce a snapshot. The three are different sentences
 * to a customer: "you have not connected a number", "your connection expired,
 * reconnect", and "Meta is having a moment, try again in a minute". The old
 * `null` return collapsed all three, so the refresh button reported a Meta
 * outage to orgs that had simply never connected (UX audit F12).
 */
export type RefreshFailure = 'not_connected' | 'token_invalid' | 'unreachable'

export type RefreshResult =
  | { ok: true; health: PhoneHealth }
  | { ok: false; reason: RefreshFailure }

/**
 * Reads the org's connection, asks Meta, stores the result.
 *
 * A successful read clears `wa_health_error`; a failed one records why, so
 * every surface can tell a dead connection from a transient blip without
 * calling Graph itself. The stored snapshot is never overwritten on failure —
 * stale numbers with an explicit "we could not reach Meta" beat blank ones.
 */
export async function refreshPhoneHealth(orgId: string): Promise<RefreshResult> {
  const db = createServiceRoleClient()
  const { data: org, error } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token')
    .eq('id', orgId)
    .maybeSingle()

  if (error || !org?.whatsapp_phone_number_id || !org.whatsapp_access_token) {
    return { ok: false, reason: 'not_connected' }
  }

  try {
    const health = await fetchPhoneHealth({
      phoneNumberId: org.whatsapp_phone_number_id,
      wabaId: org.whatsapp_waba_id ?? null,
      accessToken: decryptToken(org.whatsapp_access_token),
    })
    // A read that worked is also proof the credentials are good, so it clears
    // any error a previous run recorded. An APPROVED review status additionally
    // lifts a restriction the webhook set — otherwise a restored account would
    // wear the red banner until someone reconnected it.
    await storePhoneHealth(orgId, {
      ...health,
      healthError: null,
      ...((health.accountReviewStatus ?? '').toUpperCase() === 'APPROVED'
        ? { accountRestricted: false }
        : {}),
    })
    return { ok: true, health }
  } catch (err) {
    const reason: RefreshFailure = err instanceof PhoneHealthError ? err.kind : 'unreachable'
    console.warn('[whatsapp/health] Refresh failed — keeping stored snapshot', {
      orgId,
      reason,
      err,
    })
    await recordHealthError(orgId, reason)
    return { ok: false, reason }
  }
}

/**
 * Refreshes every connected org. Sequential on purpose: a few dozen orgs, one
 * Graph read each, and no reason to burst Meta from a daily cron.
 */
export async function refreshAllPhoneHealth(): Promise<{
  refreshed: number
  failed: number
  /** Of the failures, how many were a dead token rather than a slow Meta. */
  expired: number
}> {
  const db = createServiceRoleClient()
  const { data: orgs, error } = await db
    .from('organizations')
    .select('id')
    .not('whatsapp_phone_number_id', 'is', null)
    .not('whatsapp_access_token', 'is', null)

  if (error) throw new Error(`Failed to list connected orgs: ${error.message}`)

  let refreshed = 0
  let failed = 0
  // Counted separately so the cron's own output says whether a bad night was
  // Meta being slow or a customer's connection actually being dead.
  let expired = 0
  for (const org of orgs ?? []) {
    const result = await refreshPhoneHealth(org.id)
    if (result.ok) refreshed += 1
    else {
      failed += 1
      if (result.reason === 'token_invalid') expired += 1
    }
  }
  return { refreshed, failed, expired }
}
