import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('./conflicts', () => ({
  assertMonthlyBillingHasNoIndividualChargeConflicts: vi.fn().mockResolvedValue(undefined),
}))

import { syncMonthlyCharge } from './syncMonthlyCharge'

/** The audit log is written on every charge insert; tests only care that it is tolerated. */
const auditStub = { insert: async () => ({ error: null }) }

describe('syncMonthlyCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a monthly charge for an approved billing row', async () => {
    const insertedPayloads: Record<string, unknown>[] = []

    mockFrom.mockImplementation((table: string) => {
      if (table === 'charge_audit_log') return auditStub
      if (table !== 'charges') {
        throw new Error(`Unexpected table: ${table}`)
      }

      const selectChain: Record<string, unknown> = {}
      selectChain['eq'] = () => selectChain
      selectChain['maybeSingle'] = async () => ({ data: null, error: null })

      return {
        select: () => selectChain,
        insert: (payload: Record<string, unknown>) => {
          insertedPayloads.push(payload)
          return {
            select: () => ({
              single: async () => ({ data: { id: 'charge-1' }, error: null }),
            }),
          }
        },
      }
    })

    const result = await syncMonthlyCharge({
      organizationId: 'org-1',
      billingRecordId: 'billing-1',
      parentId: 'parent-1',
      billingMonth: '2026-05',
      amount: 320,
      isApproved: true,
      isPaid: false,
    })

    expect(result).toEqual({
      chargeId: 'charge-1',
      chargeStatus: 'pending',
      isPaid: false,
    })
    expect(insertedPayloads[0]).toMatchObject({
      organization_id: 'org-1',
      parent_id: 'parent-1',
      billing_record_id: 'billing-1',
      billing_month: '2026-05',
      amount: 320,
      charge_type: 'monthly',
      status: 'pending',
    })
  })

  it('removes an unpaid monthly charge when billing becomes unapproved', async () => {
    const deleteSecondEq = vi.fn(async () => ({ error: null }))
    const deleteFirstEq = vi.fn(() => ({ eq: deleteSecondEq }))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'charge_audit_log') return auditStub
      if (table !== 'charges') {
        throw new Error(`Unexpected table: ${table}`)
      }

      const selectChain: Record<string, unknown> = {}
      selectChain['eq'] = () => selectChain
      selectChain['maybeSingle'] = async () => ({
        data: { id: 'charge-1', status: 'pending', paid_at: null },
        error: null,
      })

      return {
        select: () => selectChain,
        delete: () => ({ eq: deleteFirstEq }),
      }
    })

    const result = await syncMonthlyCharge({
      organizationId: 'org-1',
      billingRecordId: 'billing-1',
      parentId: 'parent-1',
      billingMonth: '2026-05',
      amount: 320,
      isApproved: false,
      isPaid: false,
    })

    expect(result).toEqual({
      chargeId: null,
      chargeStatus: null,
      isPaid: false,
    })
    expect(deleteFirstEq).toHaveBeenCalledWith('id', 'charge-1')
    expect(deleteSecondEq).toHaveBeenCalledWith('organization_id', 'org-1')
  })

  it.each(['waived', 'voided'] as const)(
    'leaves a %s charge untouched when billing becomes unapproved',
    async (terminalStatus) => {
      const deleteFn = vi.fn()

      mockFrom.mockImplementation((table: string) => {
        if (table === 'charge_audit_log') return auditStub
        if (table !== 'charges') {
          throw new Error(`Unexpected table: ${table}`)
        }

        const selectChain: Record<string, unknown> = {}
        selectChain['eq'] = () => selectChain
        selectChain['maybeSingle'] = async () => ({
          data: { id: 'charge-1', status: terminalStatus, paid_at: null },
          error: null,
        })

        return { select: () => selectChain, delete: deleteFn }
      })

      const result = await syncMonthlyCharge({
        organizationId: 'org-1',
        billingRecordId: 'billing-1',
        parentId: 'parent-1',
        billingMonth: '2026-05',
        amount: 320,
        isApproved: false,
        isPaid: false,
      })

      expect(deleteFn).not.toHaveBeenCalled()
      expect(result).toEqual({
        chargeId: 'charge-1',
        chargeStatus: terminalStatus,
        isPaid: false,
      })
    }
  )

  it('does not resurrect a voided charge on recalculation', async () => {
    const updateFn = vi.fn()
    const insertFn = vi.fn()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'charge_audit_log') return auditStub
      if (table !== 'charges') {
        throw new Error(`Unexpected table: ${table}`)
      }

      const selectChain: Record<string, unknown> = {}
      selectChain['eq'] = () => selectChain
      selectChain['maybeSingle'] = async () => ({
        data: { id: 'charge-1', status: 'voided', paid_at: null },
        error: null,
      })

      return { select: () => selectChain, update: updateFn, insert: insertFn }
    })

    const result = await syncMonthlyCharge({
      organizationId: 'org-1',
      billingRecordId: 'billing-1',
      parentId: 'parent-1',
      billingMonth: '2026-05',
      amount: 480,
      isApproved: true,
      isPaid: false,
    })

    expect(updateFn).not.toHaveBeenCalled()
    expect(insertFn).not.toHaveBeenCalled()
    expect(result).toEqual({
      chargeId: 'charge-1',
      chargeStatus: 'voided',
      isPaid: false,
    })
  })
})

describe('syncMonthlyCharge and settled money', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function paidCharge(amount: number, options: { update?: unknown } = {}) {
    const audit: Record<string, unknown>[] = []
    const update = options.update ?? vi.fn()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'charge_audit_log') {
        return {
          insert: async (row: Record<string, unknown>) => {
            audit.push(row)
            return { error: null }
          },
        }
      }
      if (table !== 'charges') throw new Error(`Unexpected table: ${table}`)

      const selectChain: Record<string, unknown> = {}
      selectChain['eq'] = () => selectChain
      selectChain['maybeSingle'] = async () => ({
        data: {
          id: 'charge-1',
          status: 'paid',
          paid_at: '2026-05-10T00:00:00.000Z',
          amount,
          amount_paid: amount,
        },
        error: null,
      })

      return { select: () => selectChain, update }
    })

    return { audit, update }
  }

  it('refuses to change the amount of a paid charge, and says so in the audit log', async () => {
    // The bug: an adjustment on a paid bill produced amount 950 with
    // amount_paid 800 and status 'paid' — money changed after the fact, on a
    // row no open-charge query shows, behind a receipt already issued.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { audit, update } = paidCharge(800)

    const result = await syncMonthlyCharge({
      organizationId: 'org-1',
      billingRecordId: 'billing-1',
      parentId: 'parent-1',
      billingMonth: '2026-05',
      amount: 950,
      isApproved: true,
      isPaid: true,
    })

    expect(result).toEqual({ chargeId: 'charge-1', chargeStatus: 'paid', isPaid: true })
    expect(update).not.toHaveBeenCalled()
    expect(audit[0]).toMatchObject({
      event_type: 'sync_conflict',
      before_amount: 800,
      after_amount: 950,
    })
    errors.mockRestore()
  })

  it('still propagates a recalculation that leaves the paid amount alone', async () => {
    const updateEq2 = vi.fn(async () => ({ error: null }))
    const updateEq1 = vi.fn(() => ({ eq: updateEq2 }))
    const update = vi.fn(() => ({ eq: updateEq1 }))
    paidCharge(800, { update })

    const result = await syncMonthlyCharge({
      organizationId: 'org-1',
      billingRecordId: 'billing-1',
      parentId: 'parent-1',
      billingMonth: '2026-05',
      amount: 800,
      isApproved: true,
      isPaid: true,
    })

    expect(result).toEqual({ chargeId: 'charge-1', chargeStatus: 'paid', isPaid: true })
    expect(update).toHaveBeenCalled()
  })
})
