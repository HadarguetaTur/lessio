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
 * page or a connection save. It returns null and leaves the stored snapshot.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { META_API_VERSION } from './graphVersion'

export type WaQualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'

export interface PhoneHealth {
  qualityRating: WaQualityRating
  /** Meta's tier label, e.g. TIER_250 / TIER_2K / TIER_10K / TIER_100K / TIER_UNLIMITED. */
  messagingLimitTier: string | null
  isOba: boolean
  obaStatus: string | null
  businessVerificationStatus: string | null
  nameStatus: string | null
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
}

type WabaFields = {
  business_verification_status?: string
  account_review_status?: string
}

/**
 * Reads the number and the WABA at Meta. Exported for the health cron, which
 * already holds the decrypted token; everything else goes through
 * refreshPhoneHealth. Throws on a non-OK response.
 */
export async function fetchPhoneHealth(params: {
  phoneNumberId: string
  wabaId: string | null
  accessToken: string
}): Promise<PhoneHealth> {
  const headers = { Authorization: `Bearer ${params.accessToken}` }

  const phoneRes = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${params.phoneNumberId}` +
      `?fields=quality_rating,messaging_limit_tier,is_official_business_account,official_business_account,name_status`,
    { headers }
  )
  if (!phoneRes.ok) {
    const body = await phoneRes.text().catch(() => '')
    throw new Error(`Meta phone health read failed: ${phoneRes.status} ${body}`)
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
    checkedAt: new Date().toISOString(),
  }
}

/** Persists a snapshot on the org. Shared by the refresh and the webhooks. */
export async function storePhoneHealth(
  orgId: string,
  health: Partial<PhoneHealth> & { checkedAt: string }
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

  const { error } = await db.from('organizations').update(patch).eq('id', orgId)
  if (error) {
    console.error('[whatsapp/health] Failed to store health', { orgId, error: error.message })
    throw new Error('Failed to store WhatsApp health')
  }
}

/**
 * Reads the org's connection, asks Meta, stores the result.
 * Returns the fresh snapshot, or null when the org is not connected or Meta
 * could not be reached — the stored snapshot stays as it was.
 */
export async function refreshPhoneHealth(orgId: string): Promise<PhoneHealth | null> {
  const db = createServiceRoleClient()
  const { data: org, error } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token')
    .eq('id', orgId)
    .maybeSingle()

  if (error || !org?.whatsapp_phone_number_id || !org.whatsapp_access_token) return null

  try {
    const health = await fetchPhoneHealth({
      phoneNumberId: org.whatsapp_phone_number_id,
      wabaId: org.whatsapp_waba_id ?? null,
      accessToken: decryptToken(org.whatsapp_access_token),
    })
    await storePhoneHealth(orgId, health)
    return health
  } catch (err) {
    console.warn('[whatsapp/health] Refresh failed — keeping stored snapshot', { orgId, err })
    return null
  }
}

/**
 * Refreshes every connected org. Sequential on purpose: a few dozen orgs, one
 * Graph read each, and no reason to burst Meta from a daily cron.
 */
export async function refreshAllPhoneHealth(): Promise<{ refreshed: number; failed: number }> {
  const db = createServiceRoleClient()
  const { data: orgs, error } = await db
    .from('organizations')
    .select('id')
    .not('whatsapp_phone_number_id', 'is', null)
    .not('whatsapp_access_token', 'is', null)

  if (error) throw new Error(`Failed to list connected orgs: ${error.message}`)

  let refreshed = 0
  let failed = 0
  for (const org of orgs ?? []) {
    const result = await refreshPhoneHealth(org.id)
    if (result) refreshed += 1
    else failed += 1
  }
  return { refreshed, failed }
}
