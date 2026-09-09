/**
 * The refund marker.
 *
 * The bug this fixes is not a crash — it is the product asserting something
 * false. So the assertions here are about what the marker refuses to do
 * (record twice, record more than came in, record against money that never
 * arrived) as much as what it records.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./audit', () => ({ logChargeAudit: vi.fn(async () => {}) }))

const mockDb = { from: vi.fn() }
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => mockDb }))

import { markChargeRefunded } from './refunds'
import { logChargeAudit } from './audit'

const auditLog = vi.mocked(logChargeAudit)

type ChargeRow = {
  id: string
  parent_id: string | null
  status: string
  amount: number
  amount_paid: number
  refunded_at: string | null
  receipt_url: string | null
}

const PAID: ChargeRow = {
  id: 'charge-1',
  parent_id: 'parent-1',
  status: 'paid',
  amount: 400,
  amount_paid: 400,
  refunded_at: null,
  receipt_url: 'https://receipts.example/1.pdf',
}

/** Captures the update payload so the test can assert what was written. */
let updatePayload: Record<string, unknown> | null = null

function setupCharge(row: ChargeRow | null, opts: { updateWins?: boolean } = {}) {
  const { updateWins = true } = opts
  updatePayload = null

  mockDb.from.mockImplementation(() => {
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn(() => chain)
    chain.is = vi.fn(() => chain)
    chain.maybeSingle = vi.fn(async () =>
      updatePayload === null
        ? { data: row, error: null }
        : { data: updateWins ? { id: row?.id } : null, error: null }
    )
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload
      return chain
    })
    return chain
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

const BASE = { chargeId: 'charge-1', organizationId: 'org-1', actorProfileId: 'user-1' }

describe('markChargeRefunded', () => {
  it('records the full collected amount when none is given', async () => {
    setupCharge(PAID)

    const result = await markChargeRefunded({
      ...BASE,
      reason: 'Parent cancelled the term',
      source: 'manual',
    })

    expect(result).toEqual({ ok: true, refundedAmount: 400, parentId: 'parent-1' })
    expect(updatePayload).toMatchObject({
      refunded_amount: 400,
      refund_reason: 'Parent cancelled the term',
      refunded_by_profile_id: 'user-1',
    })
    expect(updatePayload?.refunded_at).toEqual(expect.any(String))
    // The status is NOT changed — a refunded charge is still settled, not open.
    expect(updatePayload).not.toHaveProperty('status')
    expect(updatePayload).not.toHaveProperty('amount_paid')
  })

  it('records a partial refund', async () => {
    setupCharge(PAID)
    const result = await markChargeRefunded({ ...BASE, amount: 150, reason: 'r', source: 'manual' })
    expect(result).toMatchObject({ ok: true, refundedAmount: 150 })
  })

  it('refuses more than what was collected', async () => {
    setupCharge({ ...PAID, amount_paid: 200 })
    const result = await markChargeRefunded({ ...BASE, amount: 400, reason: 'r', source: 'manual' })
    expect(result).toEqual({ ok: false, reason: 'amount_exceeds_paid' })
    expect(updatePayload).toBeNull()
  })

  it('refuses a charge nothing was ever collected on', async () => {
    setupCharge({ ...PAID, status: 'pending', amount_paid: 0 })
    const result = await markChargeRefunded({ ...BASE, reason: 'r', source: 'manual' })
    expect(result).toEqual({ ok: false, reason: 'not_paid' })
  })

  it('refuses a charge that already carries a marker', async () => {
    setupCharge({ ...PAID, refunded_at: '2026-09-01T00:00:00.000Z' })
    const result = await markChargeRefunded({ ...BASE, reason: 'r', source: 'manual' })
    expect(result).toEqual({ ok: false, reason: 'already_refunded' })
    expect(updatePayload).toBeNull()
    expect(auditLog).not.toHaveBeenCalled()
  })

  /**
   * A provider can deliver the same reversal callback twice. The UPDATE is
   * guarded on `refunded_at IS NULL`, so the loser of the race writes nothing
   * and logs nothing — one marker, one audit row.
   */
  it('is idempotent when two callbacks race', async () => {
    setupCharge(PAID, { updateWins: false })
    const result = await markChargeRefunded({
      ...BASE,
      actorProfileId: null,
      reason: 'Refund reported by payplus',
      source: 'provider_webhook',
    })
    expect(result).toEqual({ ok: false, reason: 'already_refunded' })
    expect(auditLog).not.toHaveBeenCalled()
  })

  it('refuses an unknown charge', async () => {
    setupCharge(null)
    const result = await markChargeRefunded({ ...BASE, reason: 'r', source: 'manual' })
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('writes an audit row that flags the receipt needing a credit note', async () => {
    setupCharge(PAID)
    await markChargeRefunded({ ...BASE, reason: 'r', source: 'manual' })

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'refunded',
        beforeStatus: 'paid',
        afterStatus: 'paid',
        metadata: expect.objectContaining({
          refunded_amount: 400,
          source: 'manual',
          receipt_needs_credit_note: true,
        }),
      })
    )
  })

  it('records a webhook refund with no actor', async () => {
    setupCharge({ ...PAID, receipt_url: null })
    await markChargeRefunded({
      ...BASE,
      actorProfileId: null,
      amount: 400,
      reason: 'Refund reported by payplus',
      source: 'provider_webhook',
      paymentReference: 'ref-9',
    })

    expect(updatePayload).toMatchObject({ refunded_by_profile_id: null })
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorProfileId: null,
        metadata: expect.objectContaining({
          source: 'provider_webhook',
          payment_reference: 'ref-9',
          receipt_needs_credit_note: false,
        }),
      })
    )
  })
})
