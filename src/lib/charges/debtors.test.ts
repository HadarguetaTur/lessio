import { describe, expect, it } from 'vitest'

import { groupDebtors } from './debtors'

function charge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'charge-1',
    amount: 100,
    charge_type: 'monthly',
    status: 'pending',
    notes: null,
    created_at: '2026-08-01T10:00:00.000Z',
    payment_link: null,
    sent_at: null,
    parent_id: 'parent-1',
    parents: {
      id: 'parent-1',
      full_name: 'דנה כהן',
      phone: '972500000001',
      opted_out_at: null,
    },
    ...overrides,
  }
}

describe('groupDebtors', () => {
  it('rolls several charges up into one parent row', () => {
    const result = groupDebtors(
      [
        charge({ id: 'c1', amount: 320.5, created_at: '2026-07-01T10:00:00.000Z' }),
        charge({ id: 'c2', amount: 120.25, created_at: '2026-08-01T10:00:00.000Z' }),
      ],
      new Map([['parent-1', ['נועה', 'איתי']]])
    )

    expect(result.debtorCount).toBe(1)
    expect(result.totalDebt).toBe(440.75)
    expect(result.rows[0]).toMatchObject({
      parentId: 'parent-1',
      parentName: 'דנה כהן',
      totalDebt: 440.75,
      chargeCount: 2,
      childrenNames: ['נועה', 'איתי'],
      oldestChargeAt: '2026-07-01T10:00:00.000Z',
    })
  })

  it('sorts parents by debt descending and charges oldest first', () => {
    const result = groupDebtors(
      [
        charge({ id: 'c1', amount: 100, created_at: '2026-08-05T10:00:00.000Z' }),
        charge({ id: 'c2', amount: 50, created_at: '2026-06-05T10:00:00.000Z' }),
        charge({
          id: 'c3',
          amount: 900,
          parent_id: 'parent-2',
          parents: { id: 'parent-2', full_name: 'רון לוי', phone: null, opted_out_at: null },
        }),
      ],
      new Map()
    )

    expect(result.rows.map((r) => r.parentId)).toEqual(['parent-2', 'parent-1'])
    expect(result.rows[1]?.charges.map((c) => c.id)).toEqual(['c2', 'c1'])
  })

  it('flags an opted-out parent so the UI can skip the reminder', () => {
    const result = groupDebtors(
      [charge({ parents: { id: 'parent-1', full_name: 'דנה', phone: '9725', opted_out_at: '2026-08-01T00:00:00.000Z' } })],
      new Map()
    )

    expect(result.rows[0]?.optedOut).toBe(true)
  })

  it('skips charges whose parent row is missing', () => {
    const result = groupDebtors([charge({ parents: null })], new Map())

    expect(result.rows).toHaveLength(0)
    expect(result.totalDebt).toBe(0)
  })

  it('reports charge age against an injected clock', () => {
    const now = Date.parse('2026-08-25T10:00:00.000Z')

    const result = groupDebtors(
      [
        charge({ id: 'c1', created_at: '2026-08-20T10:00:00.000Z' }),
        charge({ id: 'c2', created_at: '2026-07-26T10:00:00.000Z' }),
      ],
      new Map(),
      now
    )

    expect(result.rows[0]?.oldestAgeDays).toBe(30)
    expect(result.rows[0]?.charges.map((c) => c.ageDays)).toEqual([30, 5])
  })

  it('counts the remaining balance, not the billed amount', () => {
    const result = groupDebtors(
      [
        charge({ id: 'c1', amount: 450, amount_paid: 200 }),
        charge({ id: 'c2', amount: 100, amount_paid: 0 }),
      ],
      new Map()
    )

    expect(result.totalDebt).toBe(350)
    expect(result.rows[0]?.charges[0]).toMatchObject({
      amount: 450,
      amountPaid: 200,
      remaining: 250,
    })
  })

  it('carries the payment link and invoice flags onto each charge', () => {
    const result = groupDebtors(
      [
        charge({
          payment_link: 'https://pay.example/abc',
          student_monthly_billing: { invoice_number: 'INV-2026-0004' },
        }),
      ],
      new Map()
    )

    expect(result.rows[0]?.charges[0]).toMatchObject({
      hasPaymentLink: true,
      hasInvoice: true,
    })
  })
})
