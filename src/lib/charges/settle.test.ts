import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockRecordChargePayment = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('./payments', () => ({
  recordChargePayment: (...args: unknown[]) => mockRecordChargePayment(...args),
}))

import { settleCharges, settleParentBalance } from './settle'

type Row = { id: string; parent_id: string; amount: number; amount_paid: number }
type OpenRow = { parent_id: string; amount: number; amount_paid: number }

/**
 * `charges` is queried for three different things; the selected columns say
 * which: the ids of a parent's open charges, the rows to settle, and the
 * parents' leftover balance afterwards.
 */
function mockCharges(toSettle: Row[], stillOpen: OpenRow[] = []) {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'charges') throw new Error(`Unexpected table: ${table}`)
    const chain: Record<string, unknown> = {}
    let data: unknown = null
    chain['select'] = (columns: string) => {
      data = columns === 'id' ? toSettle.map((r) => ({ id: r.id }))
        : columns.startsWith('id,') ? toSettle
        : stillOpen
      return chain
    }
    chain['eq'] = () => chain
    chain['in'] = () => chain
    chain['order'] = async () => ({ data, error: null })
    chain['then'] = (resolve: (v: unknown) => unknown) => resolve({ data, error: null })
    return chain
  })
}

const details = {
  organizationId: 'org-1',
  method: 'bank_transfer' as const,
  notes: 'העברה מ-3.9',
  actorProfileId: 'profile-1',
}

beforeEach(() => {
  mockFrom.mockReset()
  mockRecordChargePayment.mockReset()
  mockRecordChargePayment.mockImplementation(async ({ amount }: { amount: number }) => ({
    ok: true,
    amountPaid: amount,
    remaining: 0,
    closed: true,
    parentId: 'parent-1',
  }))
})

describe('settleCharges', () => {
  it('records the remaining amount against every selected charge', async () => {
    mockCharges([
      { id: 'c-1', parent_id: 'p-1', amount: 250, amount_paid: 0 },
      { id: 'c-2', parent_id: 'p-1', amount: 300, amount_paid: 100 }, // partially paid
    ])

    const result = await settleCharges({ chargeIds: ['c-1', 'c-2'], ...details })

    expect(result).toMatchObject({ ok: true, settledChargeIds: ['c-1', 'c-2'], failedChargeIds: [], total: 450 })
    expect(mockRecordChargePayment.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({
        chargeId: 'c-1', amount: 250, method: 'bank_transfer',
        notes: 'העברה מ-3.9', actorProfileId: 'profile-1', organizationId: 'org-1',
      }),
      expect.objectContaining({ chargeId: 'c-2', amount: 200 }),
    ])
  })

  it('groups the outcome per parent with what each still owes', async () => {
    mockCharges(
      [
        { id: 'c-1', parent_id: 'p-1', amount: 250, amount_paid: 0 },
        { id: 'c-2', parent_id: 'p-2', amount: 175, amount_paid: 0 },
        { id: 'c-3', parent_id: 'p-1', amount: 100, amount_paid: 0 },
      ],
      // p-1 has one charge left open that was not part of the selection.
      [{ parent_id: 'p-1', amount: 400, amount_paid: 150 }]
    )

    const result = await settleCharges({ chargeIds: ['c-1', 'c-2', 'c-3'], ...details })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.byParent).toEqual([
      { parentId: 'p-1', chargeIds: ['c-1', 'c-3'], amount: 350, remaining: 250 },
      { parentId: 'p-2', chargeIds: ['c-2'], amount: 175, remaining: 0 },
    ])
  })

  it('reports nothing_open for an empty id list, without querying', async () => {
    expect(await settleCharges({ chargeIds: [], ...details })).toEqual({ ok: false, reason: 'nothing_open' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('reports nothing_open when none of the ids is still open', async () => {
    // A closed or foreign charge is filtered out by the query itself.
    mockCharges([])
    expect(await settleCharges({ chargeIds: ['c-1'], ...details })).toEqual({ ok: false, reason: 'nothing_open' })
    expect(mockRecordChargePayment).not.toHaveBeenCalled()
  })

  it('skips a charge whose amount is already fully covered', async () => {
    mockCharges([{ id: 'c-1', parent_id: 'p-1', amount: 100, amount_paid: 100 }])
    expect(await settleCharges({ chargeIds: ['c-1'], ...details })).toEqual({ ok: false, reason: 'nothing_open' })
  })

  it('keeps going after one charge fails and names it', async () => {
    mockCharges([
      { id: 'c-1', parent_id: 'p-1', amount: 100, amount_paid: 0 },
      { id: 'c-2', parent_id: 'p-1', amount: 200, amount_paid: 0 },
      { id: 'c-3', parent_id: 'p-1', amount: 300, amount_paid: 0 },
    ])
    mockRecordChargePayment
      .mockImplementationOnce(async () => ({ ok: true, amountPaid: 100, remaining: 0, closed: true, parentId: 'p-1' }))
      .mockImplementationOnce(async () => ({ ok: false, reason: 'not_open' }))
      .mockImplementationOnce(async () => { throw new Error('db down') })

    const result = await settleCharges({ chargeIds: ['c-1', 'c-2', 'c-3'], ...details })

    expect(result).toMatchObject({
      ok: true,
      settledChargeIds: ['c-1'],
      failedChargeIds: ['c-2', 'c-3'],
      total: 100,
    })
    if (!result.ok) return
    expect(result.byParent).toEqual([
      expect.objectContaining({ parentId: 'p-1', chargeIds: ['c-1'], amount: 100 }),
    ])
  })
})

describe('settleParentBalance', () => {
  it('settles every open charge of the parent', async () => {
    mockCharges([
      { id: 'c-1', parent_id: 'p-1', amount: 250, amount_paid: 0 },
      { id: 'c-2', parent_id: 'p-1', amount: 175, amount_paid: 0 },
    ])

    const result = await settleParentBalance({ parentId: 'p-1', ...details })

    expect(result).toEqual({
      ok: true,
      settledChargeIds: ['c-1', 'c-2'],
      failedChargeIds: [],
      total: 425,
    })
    expect(mockRecordChargePayment).toHaveBeenCalledTimes(2)
  })

  it('reports nothing_open when the parent owes nothing', async () => {
    mockCharges([])
    expect(await settleParentBalance({ parentId: 'p-1', ...details })).toEqual({
      ok: false,
      reason: 'nothing_open',
    })
  })
})
