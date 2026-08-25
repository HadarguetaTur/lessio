import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

import { canTransition, voidCharge, waiveCharge } from './resolve'

type ChargeRow = {
  id: string
  parent_id: string | null
  status: string
  amount: number
  payment_link: string | null
  billing_record_id: string | null
}

const auditRows: Record<string, unknown>[] = []

/**
 * Mocks the two tables resolveCharge touches: `charges` (load + guarded update)
 * and `charge_audit_log` (append). `updateMatches` mirrors the `.in('status', …)`
 * filter — false means the row was resolved by someone else first.
 */
function mockCharges(charge: ChargeRow | null, updateMatches = true) {
  const updatePayloads: Record<string, unknown>[] = []

  mockFrom.mockImplementation((table: string) => {
    if (table === 'charge_audit_log') {
      return {
        insert: async (payload: Record<string, unknown>) => {
          auditRows.push(payload)
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
        updatePayloads.push(payload)
        const chain: Record<string, unknown> = {}
        chain['eq'] = () => chain
        chain['in'] = () => chain
        chain['select'] = () => chain
        chain['maybeSingle'] = async () => ({
          data: updateMatches ? { id: charge?.id } : null,
          error: null,
        })
        return chain
      },
    }
  })

  return updatePayloads
}

const openCharge: ChargeRow = {
  id: 'charge-1',
  parent_id: 'parent-1',
  status: 'pending',
  amount: 320,
  payment_link: null,
  billing_record_id: null,
}

describe('canTransition', () => {
  it('allows waiving and voiding an open charge', () => {
    expect(canTransition('pending', 'waived')).toBe(true)
    expect(canTransition('pending', 'voided')).toBe(true)
    expect(canTransition('invoiced', 'waived')).toBe(true)
    expect(canTransition('invoiced', 'voided')).toBe(true)
  })

  it('rejects settled charges', () => {
    expect(canTransition('paid', 'waived')).toBe(false)
    expect(canTransition('waived', 'voided')).toBe(false)
    expect(canTransition('voided', 'waived')).toBe(false)
  })
})

describe('waiveCharge / voidCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auditRows.length = 0
  })

  it('waives an open charge and records who, when and why', async () => {
    const updates = mockCharges(openCharge)

    const result = await waiveCharge('charge-1', 'org-1', 'profile-1', 'הנחה מיוחדת')

    expect(result).toEqual({ ok: true, parentId: 'parent-1', previousStatus: 'pending' })
    expect(updates[0]).toMatchObject({
      status: 'waived',
      resolved_by_profile_id: 'profile-1',
      resolution_reason: 'הנחה מיוחדת',
    })
    expect(updates[0]?.resolved_at).toEqual(expect.any(String))
    expect(auditRows[0]).toMatchObject({
      charge_id: 'charge-1',
      event_type: 'waived',
      actor_profile_id: 'profile-1',
      before_status: 'pending',
      after_status: 'waived',
      reason: 'הנחה מיוחדת',
    })
  })

  it('voids an invoiced charge', async () => {
    const updates = mockCharges({ ...openCharge, status: 'invoiced' })

    const result = await voidCharge('charge-1', 'org-1', 'profile-1', 'נרשם בטעות')

    expect(result).toEqual({ ok: true, parentId: 'parent-1', previousStatus: 'invoiced' })
    expect(updates[0]).toMatchObject({ status: 'voided' })
  })

  it('refuses to waive a paid charge', async () => {
    const updates = mockCharges({ ...openCharge, status: 'paid' })

    const result = await waiveCharge('charge-1', 'org-1', 'profile-1', 'טעות')

    expect(result).toEqual({ ok: false, reason: 'already_paid' })
    expect(updates).toHaveLength(0)
    expect(auditRows).toHaveLength(0)
  })

  it('refuses to resolve an already-waived charge', async () => {
    const updates = mockCharges({ ...openCharge, status: 'waived' })

    const result = await voidCharge('charge-1', 'org-1', 'profile-1', 'טעות')

    expect(result).toEqual({ ok: false, reason: 'already_resolved' })
    expect(updates).toHaveLength(0)
  })

  it('returns not_found for a charge outside the org', async () => {
    mockCharges(null)

    const result = await waiveCharge('charge-1', 'org-1', 'profile-1', 'טעות')

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('does not log an audit row when a concurrent resolve won the race', async () => {
    mockCharges(openCharge, false)

    const result = await waiveCharge('charge-1', 'org-1', 'profile-1', 'טעות')

    expect(result).toEqual({ ok: false, reason: 'already_resolved' })
    expect(auditRows).toHaveLength(0)
  })

  it('records a live payment link on the audit entry', async () => {
    mockCharges({ ...openCharge, payment_link: 'https://pay.example/abc' })

    await waiveCharge('charge-1', 'org-1', 'profile-1', 'שולם במזומן')

    expect(auditRows[0]?.metadata).toMatchObject({ had_payment_link: true })
  })
})
