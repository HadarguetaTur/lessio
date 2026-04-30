import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

import { syncMonthlyCharge } from './syncMonthlyCharge'

describe('syncMonthlyCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a monthly charge for an approved billing row', async () => {
    const insertedPayloads: Record<string, unknown>[] = []

    mockFrom.mockImplementation((table: string) => {
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
})
