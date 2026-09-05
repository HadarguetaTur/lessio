/**
 * Which card a renewal charges.
 *
 * organization_subscriptions.sumit_payment_token is stored encrypted (security
 * audit 2026-09-04) but is deliberately *not* what gets charged: the renewal
 * engine passes `token: null`, which tells Sumit to bill whatever card is
 * currently on file for that customer. That is the point — an owner who
 * replaced their card on Sumit's own customer page, or whose card Sumit
 * refreshed on expiry, is charged the new card instead of having the
 * subscription lapse against a dead token. The customer id is org-scoped, so
 * "whatever card is on file" can never be another organization's card.
 *
 * The stored token stays: `claim_saas_renewals` only claims subscriptions that
 * have one, so it remains the marker for "this subscription has a card".
 *
 * Every case here runs with authoriseOnly, which returns straight after the
 * charge attempt without recording anything.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient, mockChargeSumitCustomer, mockGetSaasPlanById } = vi.hoisted(
  () => ({
    mockCreateServiceRoleClient: vi.fn(),
    mockChargeSumitCustomer: vi.fn(),
    mockGetSaasPlanById: vi.fn(),
  })
)

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('./sumit', () => ({ chargeSumitCustomer: mockChargeSumitCustomer }))
vi.mock('./plans', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./plans')>()),
  getSaasPlanById: mockGetSaasPlanById,
}))
vi.mock('./lifecycleEmails', () => ({ sendLifecycleEmail: vi.fn() }))
vi.mock('./serviceState', () => ({ syncOrgServiceStates: vi.fn() }))

import { runRenewalCharges } from './renewal'
import { encryptSaasPaymentToken } from '@/lib/crypto'

const ORG = '00000000-0000-4000-8000-0000000000a1'
const SUB = '00000000-0000-4000-8000-0000000000a2'
const PLAINTEXT_TOKEN = 'tok_live_real_card'

function claimedRow(over: Record<string, unknown> = {}) {
  return {
    id: SUB,
    organization_id: ORG,
    plan_id: 'plan-solo',
    billing_interval: 'monthly',
    current_period_end: '2026-09-01T00:00:00Z',
    renewal_attempts: 0,
    sumit_customer_id: 'cus_1',
    sumit_payment_token: encryptSaasPaymentToken(PLAINTEXT_TOKEN),
    card_last_four: '4242',
    ...over,
  }
}

/** Minimal client: the RPC that claims rows, plus the org locale lookup. */
function dbReturning(rows: unknown[]) {
  return {
    rpc: vi.fn(async () => ({ data: rows, error: null })),
    from: vi.fn(() => {
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        maybeSingle: async () => ({ data: { default_locale: 'he' }, error: null }),
      })
      return b
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSaasPlanById.mockResolvedValue({
    id: 'plan-solo',
    display_name_he: 'יחיד',
    display_name_en: 'Solo',
    price_monthly: 149,
    price_yearly: 1490,
  })
  mockChargeSumitCustomer.mockResolvedValue({ ok: true })
})

describe('renewal card selection', () => {
  it('charges by Sumit customer and sends no card token', async () => {
    const row = claimedRow()
    mockCreateServiceRoleClient.mockReturnValue(dbReturning([row]))

    const summary = await runRenewalCharges(new Date('2026-09-01T12:00:00Z'), {
      authoriseOnly: true,
    })

    expect(summary.charged).toBe(1)
    expect(mockChargeSumitCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_1', token: null })
    )
    // Neither form of the token may reach the provider: the plaintext would
    // pin a card the owner may have replaced, the ciphertext is meaningless.
    expect(mockChargeSumitCustomer).not.toHaveBeenCalledWith(
      expect.objectContaining({ token: PLAINTEXT_TOKEN })
    )
    expect(mockChargeSumitCustomer).not.toHaveBeenCalledWith(
      expect.objectContaining({ token: row.sumit_payment_token })
    )
  })

  it('renews normally even when the stored token is stale or unreadable', async () => {
    // A token left over from a card the owner has since replaced must not stop
    // the renewal — nothing on this path reads it.
    mockCreateServiceRoleClient.mockReturnValue(
      dbReturning([claimedRow({ sumit_payment_token: 'not-valid-ciphertext' })])
    )

    const summary = await runRenewalCharges(new Date('2026-09-01T12:00:00Z'), {
      authoriseOnly: true,
    })

    expect(summary.charged).toBe(1)
    expect(summary.errored).toBe(0)
    expect(mockChargeSumitCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ token: null })
    )
  })

  it('skips a subscription with no Sumit customer rather than charging blind', async () => {
    // Without a customer id there is nothing to charge against; the nightly
    // checker owns that state.
    mockCreateServiceRoleClient.mockReturnValue(
      dbReturning([claimedRow({ sumit_customer_id: null })])
    )

    const summary = await runRenewalCharges(new Date('2026-09-01T12:00:00Z'), {
      authoriseOnly: true,
    })

    expect(mockChargeSumitCustomer).not.toHaveBeenCalled()
    expect(summary.skipped).toBe(1)
    expect(summary.charged).toBe(0)
  })
})
