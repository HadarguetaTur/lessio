/**
 * A Meta account restriction has to survive the trip from Graph to the org row.
 *
 * `fetchPhoneHealth` has always asked the WABA for account_review_status, and
 * `refreshPhoneHealth` used it only to *clear* a restriction on APPROVED. A
 * restricted account was therefore fetched and dropped: the Graph read succeeds
 * perfectly well on a restricted account (only sending fails), so the daily
 * refresh recorded a clean snapshot and every surface stayed green while
 * nothing could be delivered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateServiceRoleClient, mockDecryptToken } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockDecryptToken: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/crypto', () => ({
  decryptToken: mockDecryptToken,
}))

import { isRestrictedReviewStatus, refreshPhoneHealth } from './health'

/** One organizations table that answers the read and captures the write. */
function makeDb() {
  const patches: Array<Record<string, unknown>> = []
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      whatsapp_phone_number_id: 'pn-1',
      whatsapp_waba_id: 'waba-1',
      whatsapp_access_token: 'encrypted',
    },
    error: null,
  })
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      update: vi.fn((patch: Record<string, unknown>) => {
        patches.push(patch)
        return { eq: vi.fn().mockResolvedValue({ error: null }) }
      }),
    })),
  }
  return { client, patches }
}

function graphResponses(reviewStatus: string | null) {
  return vi.fn(async (url: string) => {
    if (url.includes('waba-1')) {
      return {
        ok: true,
        json: async () => ({
          business_verification_status: 'verified',
          ...(reviewStatus === null ? {} : { account_review_status: reviewStatus }),
        }),
      }
    }
    return {
      ok: true,
      json: async () => ({
        quality_rating: 'GREEN',
        messaging_limit_tier: 'TIER_1K',
        display_phone_number: '+972 50-000-0000',
        verified_name: 'Studio',
      }),
    }
  })
}

describe('isRestrictedReviewStatus()', () => {
  it('reads Meta’s vocabulary in both directions', () => {
    expect(isRestrictedReviewStatus('APPROVED')).toBe(false)
    expect(isRestrictedReviewStatus('REJECTED')).toBe(true)
    expect(isRestrictedReviewStatus('restricted')).toBe(true)
    expect(isRestrictedReviewStatus('DISABLED')).toBe(true)
  })

  it('answers null when Meta said nothing, so a webhook’s flag survives', () => {
    expect(isRestrictedReviewStatus(null)).toBeNull()
    expect(isRestrictedReviewStatus('PENDING')).toBeNull()
    expect(isRestrictedReviewStatus('SOMETHING_NEW')).toBeNull()
  })
})

describe('refreshPhoneHealth() and account restrictions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDecryptToken.mockReturnValue('token-1')
  })

  it('persists a restriction Meta reports on an otherwise healthy read', async () => {
    const db = makeDb()
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    vi.stubGlobal('fetch', graphResponses('RESTRICTED'))

    const result = await refreshPhoneHealth('org-1')

    expect(result.ok).toBe(true)
    expect(db.patches.at(-1)).toMatchObject({ wa_account_restricted: true })
    vi.unstubAllGlobals()
  })

  it('lifts a restriction once Meta approves the account again', async () => {
    const db = makeDb()
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    vi.stubGlobal('fetch', graphResponses('APPROVED'))

    await refreshPhoneHealth('org-1')

    expect(db.patches.at(-1)).toMatchObject({ wa_account_restricted: false })
    vi.unstubAllGlobals()
  })

  it('leaves the flag alone when Meta gave no review status', async () => {
    const db = makeDb()
    mockCreateServiceRoleClient.mockReturnValue(db.client)
    vi.stubGlobal('fetch', graphResponses(null))

    await refreshPhoneHealth('org-1')

    expect(db.patches.at(-1)).not.toHaveProperty('wa_account_restricted')
    vi.unstubAllGlobals()
  })
})
