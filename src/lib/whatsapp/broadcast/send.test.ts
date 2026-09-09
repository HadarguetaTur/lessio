/**
 * The sender's pure edges.
 *
 * The drain itself is exercised end-to-end against a real database; what is
 * unit-tested here is the part with no I/O and the most room for a silent
 * mistake: reading Meta's error code back out of a thrown error. Get that wrong
 * and every rate limit is recorded as a permanent failure.
 */

import { describe, it, expect } from 'vitest'
import { metaErrorCode, toGuardOrg } from './send'

describe('metaErrorCode', () => {
  it('finds the code in the JSON Meta returns', () => {
    const thrown = new Error(
      'WhatsApp template API error 400: {"error":{"message":"(#131049) message limit","type":"OAuthException","code":131049,"error_subcode":2494055}}'
    )
    expect(metaErrorCode(thrown)).toBe(131049)
  })

  it('tolerates whitespace in the payload', () => {
    expect(metaErrorCode(new Error('{ "error": { "code" : 130429 } }'))).toBe(130429)
  })

  it('answers null when there is no code to find', () => {
    expect(metaErrorCode(new Error('socket hang up'))).toBeNull()
    expect(metaErrorCode('some string')).toBeNull()
    expect(metaErrorCode(null)).toBeNull()
  })

  it('does not mistake an error_subcode for the code', () => {
    // "code" appears second here; the regex must still take the first "code":
    // key it meets, which is the one Meta documents.
    const thrown = new Error('{"error":{"error_subcode":2494055,"code":131050}}')
    expect(metaErrorCode(thrown)).toBe(131050)
  })
})

describe('toGuardOrg', () => {
  const row = {
    id: 'org-1',
    name: 'Studio',
    timezone: null,
    default_locale: null,
    whatsapp_phone_number_id: 'pn-1',
    whatsapp_access_token: 'enc',
    wa_quality_rating: null,
    wa_messaging_limit_tier: 'TIER_2K',
    wa_business_verification_status: 'verified',
    wa_connected_at: null,
    broadcasts_enabled: null,
    broadcast_quiet_start: null,
    broadcast_quiet_end: null,
    broadcast_max_promo_per_week: null,
    broadcast_max_updates_per_week: null,
  }

  it('fills the defaults an older org row has not got yet', () => {
    const org = toGuardOrg(row, false)
    expect(org).toMatchObject({
      timezone: 'Asia/Jerusalem',
      quietStart: 8,
      quietEnd: 21,
      maxPromoPerWeek: 1,
      maxUpdatesPerWeek: 3,
      waQualityRating: 'UNKNOWN',
    })
  })

  it('treats a null kill switch as enabled, and false as disabled', () => {
    expect(toGuardOrg(row, false).broadcastsEnabled).toBe(true)
    expect(toGuardOrg({ ...row, broadcasts_enabled: false }, false).broadcastsEnabled).toBe(false)
  })

  it('carries the lapsed flag through', () => {
    expect(toGuardOrg(row, true).subscriptionLapsed).toBe(true)
  })
})
