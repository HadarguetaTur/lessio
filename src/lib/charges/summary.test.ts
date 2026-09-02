import { describe, expect, it } from 'vitest'

import { summarizeCharges, type OpenChargeRow } from './summary'

const TODAY = '2026-09-01'

function charge(overrides: Partial<OpenChargeRow> = {}): OpenChargeRow {
  return {
    amount: 100,
    amount_paid: 0,
    parent_id: 'parent-1',
    due_date: '2026-09-10',
    ...overrides,
  }
}

describe('summarizeCharges', () => {
  it('sums what is still owed, not what was billed', () => {
    const result = summarizeCharges(
      [charge({ amount: 300, amount_paid: 120 }), charge({ amount: 50.25 })],
      [],
      TODAY
    )
    expect(result.openTotal).toBe(230.25)
    expect(result.openCount).toBe(2)
  })

  it('drops a charge whose balance is already covered', () => {
    const result = summarizeCharges(
      [charge({ amount: 100, amount_paid: 100 }), charge({ amount: 80 })],
      [],
      TODAY
    )
    expect(result.openTotal).toBe(80)
    expect(result.openCount).toBe(1)
    expect(result.openDebtorCount).toBe(1)
  })

  it('counts each parent once', () => {
    const result = summarizeCharges(
      [
        charge({ parent_id: 'a' }),
        charge({ parent_id: 'a' }),
        charge({ parent_id: 'b' }),
        charge({ parent_id: null }),
      ],
      [],
      TODAY
    )
    expect(result.openDebtorCount).toBe(2)
    expect(result.openCount).toBe(4)
  })

  it('is overdue only from the day after the due date', () => {
    const result = summarizeCharges(
      [
        charge({ amount: 10, due_date: '2026-08-31' }), // yesterday → overdue
        charge({ amount: 20, due_date: '2026-09-01' }), // due today → not yet
        charge({ amount: 40, due_date: '2026-09-02' }), // tomorrow
        charge({ amount: 80, due_date: null }), // no terms → never overdue
      ],
      [],
      TODAY
    )
    expect(result.overdueTotal).toBe(10)
    expect(result.overdueCount).toBe(1)
    expect(result.openTotal).toBe(150)
  })

  it('ages a partially-paid charge by its remainder', () => {
    const result = summarizeCharges(
      [charge({ amount: 500, amount_paid: 200, due_date: '2026-01-01' })],
      [],
      TODAY
    )
    expect(result.overdueTotal).toBe(300)
  })

  it('sums the month’s payments, numeric strings included', () => {
    const result = summarizeCharges([], [{ amount: '120.10' }, { amount: 79.9 }], TODAY)
    expect(result.collectedThisMonth).toBe(200)
  })

  it('returns zeros for an org with nothing open', () => {
    expect(summarizeCharges([], [], TODAY)).toEqual({
      openTotal: 0,
      openCount: 0,
      openDebtorCount: 0,
      overdueTotal: 0,
      overdueCount: 0,
      collectedThisMonth: 0,
    })
  })
})
