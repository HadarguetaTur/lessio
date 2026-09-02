import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()
const mockRecordChargePayment = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('./payments', () => ({
  recordChargePayment: (...args: unknown[]) => mockRecordChargePayment(...args),
}))

import { settleParentBalance } from './settle'

type Row = { id: string; amount: number; amount_paid: number }

function mockOpenCharges(rows: Row[]) {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'charges') throw new Error(`Unexpected table: ${table}`)
    const chain: Record<string, unknown> = {}
    chain['select'] = () => chain
    chain['eq'] = () => chain
    chain['in'] = () => chain
    chain['order'] = async () => ({ data: rows, error: null })
    return chain
  })
}

const input = {
  parentId: 'parent-1',
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

describe('settleParentBalance', () => {
  it('records the remaining amount against every open charge, oldest first', async () => {
    mockOpenCharges([
      { id: 'c-1', amount: 250, amount_paid: 0 },
      { id: 'c-2', amount: 300, amount_paid: 100 }, // partially paid
      { id: 'c-3', amount: 175, amount_paid: 0 },
    ])

    const result = await settleParentBalance(input)

    expect(result).toEqual({
      ok: true,
      settledChargeIds: ['c-1', 'c-2', 'c-3'],
      failedChargeIds: [],
      total: 625,
    })
    expect(mockRecordChargePayment).toHaveBeenCalledTimes(3)
    expect(mockRecordChargePayment.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ chargeId: 'c-1', amount: 250, method: 'bank_transfer', notes: 'העברה מ-3.9', actorProfileId: 'profile-1', organizationId: 'org-1' }),
      expect.objectContaining({ chargeId: 'c-2', amount: 200 }),
      expect.objectContaining({ chargeId: 'c-3', amount: 175 }),
    ])
  })

  it('reports nothing_open when the parent owes nothing', async () => {
    mockOpenCharges([])
    expect(await settleParentBalance(input)).toEqual({ ok: false, reason: 'nothing_open' })
    expect(mockRecordChargePayment).not.toHaveBeenCalled()
  })

  it('skips an open charge whose amount is already fully covered', async () => {
    mockOpenCharges([{ id: 'c-1', amount: 100, amount_paid: 100 }])
    expect(await settleParentBalance(input)).toEqual({ ok: false, reason: 'nothing_open' })
  })

  it('keeps going after one charge fails and names it', async () => {
    mockOpenCharges([
      { id: 'c-1', amount: 100, amount_paid: 0 },
      { id: 'c-2', amount: 200, amount_paid: 0 },
      { id: 'c-3', amount: 300, amount_paid: 0 },
    ])
    mockRecordChargePayment
      .mockImplementationOnce(async () => ({ ok: true, amountPaid: 100, remaining: 0, closed: true, parentId: 'parent-1' }))
      .mockImplementationOnce(async () => ({ ok: false, reason: 'insert_failed' }))
      .mockImplementationOnce(async () => { throw new Error('db down') })

    const result = await settleParentBalance(input)

    expect(result).toEqual({
      ok: true,
      settledChargeIds: ['c-1'],
      failedChargeIds: ['c-2', 'c-3'],
      total: 100,
    })
  })
})
