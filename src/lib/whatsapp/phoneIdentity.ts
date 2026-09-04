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
 * Never throws. `ok: false` means Meta could not confirm the connection.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { META_API_VERSION } from './graphVersion'

export interface PhoneIdentity {
  ok: boolean
  displayPhoneNumber: string | null
  verifiedName: string | null
}

const UNVERIFIED: PhoneIdentity = { ok: false, displayPhoneNumber: null, verifiedName: null }

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
      console.warn('[whatsapp/phoneIdentity] Graph lookup failed', {
        orgId,
        status: res.status,
      })
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
    return { ok: true, displayPhoneNumber, verifiedName }
  } catch (err) {
    console.warn('[whatsapp/phoneIdentity] Graph lookup threw', { orgId, err })
    return UNVERIFIED
  }
}
