import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

import { markChargeAsPaid, ChargeAlreadyResolvedError } from './index'

/** The status guard reads the charge before updating it. */
function loadChain(charge: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {}
  chain['eq'] = () => chain
  chain['maybeSingle'] = async () => ({ data: charge, error: null })
  return () => chain
}

const auditStub = { insert: async () => ({ error: null }) }

describe('markChargeAsPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('syncs monthly billing rows when a monthly charge is marked paid', async () => {
    const chargesSingle = vi.fn(async () => ({
      data: { charge_type: 'monthly', billing_record_id: 'billing-1' },
      error: null,
    }))
    const chargesSelect = vi.fn(() => ({ single: chargesSingle }))
    const chargesEq2 = vi.fn(() => ({ select: chargesSelect }))
    const chargesEq1 = vi.fn(() => ({ eq: chargesEq2 }))
    const chargesUpdate = vi.fn(() => ({ eq: chargesEq1 }))

    const billingEq2 = vi.fn(async () => ({ error: null }))
    const billingEq1 = vi.fn(() => ({ eq: billingEq2 }))
    const billingUpdate = vi.fn(() => ({ eq: billingEq1 }))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'charges') {
        return {
          select: loadChain({ status: 'pending', amount: 320, parent_id: 'parent-1' }),
          update: chargesUpdate,
        }
      }
      if (table === 'student_monthly_billing') {
        return { update: billingUpdate }
      }
      if (table === 'charge_audit_log' || table === 'charge_payments') {
        return auditStub
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    await markChargeAsPaid('charge-1', 'org-1', 'manual note')

    expect(chargesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'paid',
        notes: 'manual note',
        paid_at: expect.any(String),
      })
    )
    expect(billingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        is_paid: true,
        updated_at: expect.any(String),
      })
    )
    expect(billingEq2).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it('does not touch monthly billing rows for non-monthly charges', async () => {
    const chargesSingle = vi.fn(async () => ({
      data: { charge_type: 'lesson', billing_record_id: null },
      error: null,
    }))
    const chargesSelect = vi.fn(() => ({ single: chargesSingle }))
    const chargesEq2 = vi.fn(() => ({ select: chargesSelect }))
    const chargesEq1 = vi.fn(() => ({ eq: chargesEq2 }))
    const chargesUpdate = vi.fn(() => ({ eq: chargesEq1 }))

    const billingUpdate = vi.fn()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'charges') {
        return {
          select: loadChain({ status: 'pending', amount: 120, parent_id: 'parent-1' }),
          update: chargesUpdate,
        }
      }
      if (table === 'student_monthly_billing') {
        return { update: billingUpdate }
      }
      if (table === 'charge_audit_log' || table === 'charge_payments') {
        return auditStub
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    await markChargeAsPaid('charge-2', 'org-1')

    expect(chargesUpdate).toHaveBeenCalled()
    expect(billingUpdate).not.toHaveBeenCalled()
  })

  it.each(['waived', 'voided'] as const)(
    'refuses to mark a %s charge as paid',
    async (status) => {
      const chargesUpdate = vi.fn()

      mockFrom.mockImplementation((table: string) => {
        if (table === 'charges') {
          return {
            select: loadChain({ status, amount: 320, parent_id: 'parent-1' }),
            update: chargesUpdate,
          }
        }
        if (table === 'charge_audit_log' || table === 'charge_payments') return auditStub
        throw new Error(`Unexpected table: ${table}`)
      })

      await expect(markChargeAsPaid('charge-3', 'org-1')).rejects.toBeInstanceOf(
        ChargeAlreadyResolvedError
      )
      expect(chargesUpdate).not.toHaveBeenCalled()
    }
  )
})
