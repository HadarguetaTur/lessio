/**
 * The human identity of the connected WhatsApp number — the phone number and
 * verified business name a studio owner can actually recognise, as opposed to
 * the opaque Phone Number ID we store for routing.
 *
 * Read live from Meta rather than persisted at connect time: already-connected
 * orgs get it with no backfill, and a failure here is itself a signal — if we
 * cannot read the number's identity, the stored token is likely dead, and the
 * connection card should not present an unqualified "connected".
 *
 * Since the UX audit that signal is no longer local to this page. A Graph 190
 * here writes `wa_health_error = 'token_invalid'`, which is what
 * connectionState.ts reads — so the connections hub and the dashboard banner
 * learn about a dead connection from the settings page's own lookup, without
 * either of them calling Meta on a page load.
 *
 * Never throws. `ok: false` means Meta could not confirm the connection.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { META_API_VERSION } from './graphVersion'
import { classifyGraphFailure, recordHealthError } from './health'

export interface PhoneIdentity {
  ok: boolean
  displayPhoneNumber: string | null
  verifiedName: string | null
}

const UNVERIFIED: PhoneIdentity = { ok: false, displayPhoneNumber: null, verifiedName: null }

/**
 * Stores what Meta just told us, so the connections hub and the dashboard
 * banner can name the number without a Graph call of their own.
 *
 * Swallows everything on purpose, and is called outside the value path: this is
 * bookkeeping on the side of somebody else's read, and a failed write must
 * never turn a successful identity lookup into "we could not verify this
 * connection" — which, before it was extracted, is exactly what it did.
 */
async function cacheIdentity(
  orgId: string,
  displayPhoneNumber: string | null,
  verifiedName: string | null
): Promise<void> {
  try {
    const { error } = await createServiceRoleClient()
      .from('organizations')
      .update({
        wa_display_phone_number: displayPhoneNumber,
        wa_verified_name: verifiedName,
        wa_health_error: null,
        wa_health_error_at: null,
      })
      .eq('id', orgId)
    if (error) {
      console.warn('[whatsapp/phoneIdentity] Could not cache identity', {
        orgId,
        error: error.message,
      })
    }
  } catch (err) {
    console.warn('[whatsapp/phoneIdentity] Could not cache identity', { orgId, err })
  }
}

export async function getPhoneIdentity(orgId: string): Promise<PhoneIdentity> {
  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', orgId)
    .single()

  if (!org?.whatsapp_phone_number_id || !org?.whatsapp_access_token) return UNVERIFIED

  let accessToken: string
  try {
    accessToken = decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[whatsapp/phoneIdentity] Token decryption failed', { orgId, err })
    return UNVERIFIED
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${org.whatsapp_phone_number_id}` +
        '?fields=display_phone_number,verified_name',
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const kind = classifyGraphFailure(res.status, body)
      console.warn('[whatsapp/phoneIdentity] Graph lookup failed', {
        orgId,
        status: res.status,
        kind,
      })
      // Fire-and-forget: the page is streaming this component and must not wait
      // on a bookkeeping write to render its answer.
      void recordHealthError(orgId, kind)
      return UNVERIFIED
    }
    const body: unknown = await res.json().catch(() => null)
    const record = body as { display_phone_number?: unknown; verified_name?: unknown } | null
    const displayPhoneNumber =
      typeof record?.display_phone_number === 'string' ? record.display_phone_number : null
    const verifiedName = typeof record?.verified_name === 'string' ? record.verified_name : null
    // A 200 with neither field would be a contract surprise — treat it as
    // unverified rather than rendering an empty identity as confirmation.
    if (!displayPhoneNumber && !verifiedName) return UNVERIFIED

    // The read worked, so the cached copy the hub and the banner render from is
    // both refreshed and, implicitly, confirmed alive.
    void cacheIdentity(orgId, displayPhoneNumber, verifiedName)

    return { ok: true, displayPhoneNumber, verifiedName }
  } catch (err) {
    // A thrown fetch is a network problem on our side, not a verdict on the
    // customer's credentials — never record it as a dead token.
    console.warn('[whatsapp/phoneIdentity] Graph lookup threw', { orgId, err })
    return UNVERIFIED
  }
}
