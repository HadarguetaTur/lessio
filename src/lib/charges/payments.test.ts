import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('./index', async () => {
  const actual = await vi.importActual<typeof import('./index')>('./index')
  return { ...actual, markChargeAsPaid: vi.fn(async () => {}) }
})

import { markChargeAsPaid } from './index'
import { recordChargePayment, remainingAmount } from './payments'

const mockMarkChargeAsPaid = vi.mocked(markChargeAsPaid)

type ChargeRow = {
  id: string
  parent_id: string | null
  status: string
  amount: number
  amount_paid: number
}

const inserted: Record<string, unknown>[] = []
const updated: Record<string, unknown>[] = []

function mockCharge(charge: ChargeRow | null) {
  inserted.length = 0
  updated.length = 0

  mockFrom.mockImplementation((table: string) => {
    if (table === 'charge_audit_log') return { insert: async () => ({ error: null }) }

    if (table === 'charge_payments') {
      return {
        insert: async (payload: Record<string, unknown>) => {
          inserted.push(payload)
          return { error: null }
        },
      }
    }

    if (table !== 'charges') throw new Error(`Unexpected table: ${table}`)

    const loadChain: Record<string, unknown> = {}
    loadChain['eq'] = () => loadChain
    loadChain['maybeSingle'] = async () => ({ data: charge, error: null })

    return {
      select: () => loadChain,
      update: (payload: Record<string, unknown>) => {
        updated.push(payload)
        const chain: Record<string, unknown> = {}
        chain['eq'] = () => chain
        // The final .eq() in the chain is awaited.
        chain['then'] = (resolve: (v: unknown) => unknown) => resolve({ error: null })
        return chain
      },
    }
  })
}

const openCharge: ChargeRow = {
  id: 'charge-1',
  parent_id: 'parent-1',
  status: 'pending',
  amount: 450,
  amount_paid: 0,
}

describe('remainingAmount', () => {
  it('is the unpaid balance, never negative', () => {
    expect(remainingAmount(450, 0)).toBe(450)
    expect(remainingAmount(450, 200)).toBe(250)
    expect(remainingAmount(450, 450)).toBe(0)
    expect(remainingAmount(450, 500)).toBe(0)
    expect(remainingAmount(450, null)).toBe(450)
  })
})

describe('recordChargePayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records a partial payment and leaves the charge open', async () => {
    mockCharge(openCharge)

    const result = await recordChargePayment({
      chargeId: 'charge-1',
      organizationId: 'org-1',
      amount: 200,
      method: 'cash',
      actorProfileId: 'profile-1',
    })

    expect(result).toEqual({ ok: true, amountPaid: 200, remaining: 250, closed: false, parentId: 'parent-1' })
    expect(inserted[0]).toMatchObject({ charge_id: 'charge-1', amount: 200, method: 'cash' })
    expect(updated[0]).toMatchObject({ amount_paid: 200 })
    expect(mockMarkChargeAsPaid).not.toHaveBeenCalled()
  })

  it('closes the charge when the remaining balance is paid', async () => {
    mockCharge({ ...openCharge, amount_paid: 200 })

    const result = await recordChargePayment({
      chargeId: 'charge-1',
      organizationId: 'org-1',
      amount: 250,
      actorProfileId: 'profile-1',
    })

    expect(result).toEqual({ ok: true, amountPaid: 450, remaining: 0, closed: true, parentId: 'parent-1' })
    // amount_paid is written before closing, so the close call adds no second payment row.
    expect(updated[0]).toMatchObject({ amount_paid: 450 })
    expect(mockMarkChargeAsPaid).toHaveBeenCalledWith(
      'charge-1',
      'org-1',
      undefined,
      'profile-1',
      expect.any(String)
    )
    expect(inserted).toHaveLength(1)
  })

  it('rejects a payment larger than the remaining balance', async () => {
    mockCharge({ ...openCharge, amount_paid: 400 })

    const result = await recordChargePayment({
      chargeId: 'charge-1',
      organizationId: 'org-1',
      amount: 100,
      actorProfileId: 'profile-1',
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_amount', remaining: 50 })
    expect(inserted).toHaveLength(0)
  })

  it.each([0, -10])('rejects a non-positive amount (%s)', async (amount) => {
    mockCharge(openCharge)

    const result = await recordChargePayment({
      chargeId: 'charge-1',
      organizationId: 'org-1',
      amount,
      actorProfileId: 'profile-1',
    })

    expect(result).toMatchObject({ ok: false, reason: 'invalid_amount' })
  })

  it.each(['paid', 'waived', 'voided'] as const)(
    'refuses to record a payment on a %s charge',
    async (status) => {
      mockCharge({ ...openCharge, status })

      const result = await recordChargePayment({
        chargeId: 'charge-1',
        organizationId: 'org-1',
        amount: 50,
        actorProfileId: 'profile-1',
      })

      expect(result).toEqual({ ok: false, reason: 'not_open' })
      expect(inserted).toHaveLength(0)
    }
  )

  it('returns not_found for a charge outside the org', async () => {
    mockCharge(null)

    const result = await recordChargePayment({
      chargeId: 'charge-1',
      organizationId: 'org-1',
      amount: 50,
      actorProfileId: 'profile-1',
    })

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})
