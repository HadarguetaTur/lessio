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

/**
 * An update chain that accepts any number of .eq() filters and records them —
 * markChargeAsPaid adds an optimistic lock on the status and amount_paid it
 * read, and the test has to be able to say which values it locked on.
 */
function updateChain(result: { data: unknown; error: unknown } = { data: { charge_type: 'lesson', billing_record_id: null }, error: null }) {
  const filters: Record<string, unknown> = {}
  const update = vi.fn((values: Record<string, unknown>) => {
    Object.assign(update, { lastValues: values })
    const chain: Record<string, unknown> = {}
    chain['eq'] = (column: string, value: unknown) => { filters[column] = value; return chain }
    chain['select'] = () => chain
    chain['single'] = async () => result
    chain['maybeSingle'] = async () => result
    return chain
  })
  return { update, filters }
}

const auditStub = { insert: async () => ({ error: null }) }

describe('markChargeAsPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('syncs monthly billing rows when a monthly charge is marked paid', async () => {
    const charges = updateChain({
      data: { charge_type: 'monthly', billing_record_id: 'billing-1' },
      error: null,
    })

    const billingEq2 = vi.fn(async () => ({ error: null }))
    const billingEq1 = vi.fn(() => ({ eq: billingEq2 }))
    const billingUpdate = vi.fn(() => ({ eq: billingEq1 }))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'charges') {
        return {
          select: loadChain({ status: 'pending', amount: 320, amount_paid: 0, parent_id: 'parent-1' }),
          update: charges.update,
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

    expect(charges.update).toHaveBeenCalledWith(
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
    const charges = updateChain()
    const billingUpdate = vi.fn()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'charges') {
        return {
          select: loadChain({ status: 'pending', amount: 120, amount_paid: 0, parent_id: 'parent-1' }),
          update: charges.update,
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

    expect(charges.update).toHaveBeenCalled()
    expect(billingUpdate).not.toHaveBeenCalled()
  })

  it.each(['waived', 'voided'] as const)(
    'refuses to mark a %s charge as paid',
    async (status) => {
      const charges = updateChain()

      mockFrom.mockImplementation((table: string) => {
        if (table === 'charges') {
          return {
            select: loadChain({ status, amount: 320, amount_paid: 0, parent_id: 'parent-1' }),
            update: charges.update,
          }
        }
        if (table === 'charge_audit_log' || table === 'charge_payments') return auditStub
        throw new Error(`Unexpected table: ${table}`)
      })

      await expect(markChargeAsPaid('charge-3', 'org-1')).rejects.toBeInstanceOf(
        ChargeAlreadyResolvedError
      )
      expect(charges.update).not.toHaveBeenCalled()
    }
  )

  it('locks the settlement to the balance it read', async () => {
    const charges = updateChain()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'charges') {
        return {
          select: loadChain({ status: 'invoiced', amount: 200, amount_paid: 50, parent_id: 'parent-1' }),
          update: charges.update,
        }
      }
      if (table === 'charge_audit_log' || table === 'charge_payments') return auditStub
      throw new Error(`Unexpected table: ${table}`)
    })

    await markChargeAsPaid('charge-4', 'org-1')

    expect(charges.filters).toMatchObject({
      id: 'charge-4',
      organization_id: 'org-1',
      status: 'invoiced',
      amount_paid: 50,
    })
  })

  it('records nothing when a webhook settles the charge first', async () => {
    // The optimistic lock matches no row, and the charge is now paid: the
    // webhook already wrote the payment. A settlement row here would put the
    // same money in charge_payments twice.
    const payments: unknown[] = []
    const charges = updateChain({ data: null, error: null })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    let load = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'charges') {
        load += 1
        return {
          // First read: still open. Second read (after the failed lock): paid.
          select: load === 1
            ? loadChain({ status: 'pending', amount: 200, amount_paid: 0, parent_id: 'parent-1' })
            : loadChain({ status: 'paid' }),
          update: charges.update,
        }
      }
      if (table === 'charge_payments') {
        return { insert: async (row: unknown) => { payments.push(row); return { error: null } } }
      }
      if (table === 'charge_audit_log') return auditStub
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(markChargeAsPaid('charge-5', 'org-1')).resolves.toBeUndefined()

    expect(payments).toHaveLength(0)
    warn.mockRestore()
  })

  it('refuses to settle a charge that moved to a terminal status underneath it', async () => {
    const payments: unknown[] = []
    const charges = updateChain({ data: null, error: null })

    let load = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'charges') {
        load += 1
        return {
          select: load === 1
            ? loadChain({ status: 'pending', amount: 200, amount_paid: 0, parent_id: 'parent-1' })
            : loadChain({ status: 'waived' }),
          update: charges.update,
        }
      }
      if (table === 'charge_payments') {
        return { insert: async (row: unknown) => { payments.push(row); return { error: null } } }
      }
      if (table === 'charge_audit_log') return auditStub
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(markChargeAsPaid('charge-6', 'org-1')).rejects.toBeInstanceOf(
      ChargeAlreadyResolvedError
    )
    expect(payments).toHaveLength(0)
  })
})
