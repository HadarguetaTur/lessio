import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPaymentRequestMessage, logPaymentRequestSent } from './index'
import type { PaymentRequestCharge } from './index'

// ── Mock clients for logPaymentRequestSent ────────────────────────────────────

const mockUpdate = vi.fn()
const mockIn = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({
    from: () => ({
      update: mockUpdate,
    }),
  }),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      update: mockUpdate,
    }),
  }),
}))

describe('buildPaymentRequestMessage', () => {
  const charges: PaymentRequestCharge[] = [
    {
      id: 'charge-1',
      amount: 100,
      charge_type: 'lesson',
      lesson_start_at: '2026-01-05T14:00:00.000Z',
      student_name: 'ישראל ישראלי',
    },
    {
      id: 'charge-2',
      amount: 50,
      charge_type: 'cancellation',
      lesson_start_at: null,
      student_name: 'רבקה לוי',
    },
  ]

  it('includes parent greeting', () => {
    const msg = buildPaymentRequestMessage('שרה כהן', charges, 'Asia/Jerusalem')
    expect(msg).toContain('שלום שרה כהן')
  })

  it('includes all charge lines with amount', () => {
    const msg = buildPaymentRequestMessage('שרה כהן', charges, 'Asia/Jerusalem')
    expect(msg).toContain('₪100.00')
    expect(msg).toContain('₪50.00')
  })

  it('includes student names in charge lines', () => {
    const msg = buildPaymentRequestMessage('שרה כהן', charges, 'Asia/Jerusalem')
    expect(msg).toContain('ישראל ישראלי')
    expect(msg).toContain('רבקה לוי')
  })

  it('includes total amount', () => {
    const msg = buildPaymentRequestMessage('שרה כהן', charges, 'Asia/Jerusalem')
    expect(msg).toContain('₪150.00')
  })

  it('uses Hebrew charge type labels', () => {
    const msg = buildPaymentRequestMessage('שרה כהן', charges, 'Asia/Jerusalem')
    expect(msg).toContain('שיעור')
    expect(msg).toContain('חיוב ביטול')
  })

  it('handles charges without lesson (manual)', () => {
    const manualCharge: PaymentRequestCharge[] = [{
      id: 'charge-3',
      amount: 200,
      charge_type: 'manual',
      lesson_start_at: null,
      student_name: null,
    }]
    const msg = buildPaymentRequestMessage('אבי לוי', manualCharge, 'Asia/Jerusalem')
    expect(msg).toContain('חיוב ידני')
    expect(msg).toContain('₪200.00')
  })
})

// ── logPaymentRequestSent ─────────────────────────────────────────────────────

describe('logPaymentRequestSent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates sent_at and sent_by_profile_id on included charges', async () => {
    const inChain = { eq: mockEq }
    mockEq.mockResolvedValue({ error: null })
    mockIn.mockReturnValue(inChain)
    mockUpdate.mockReturnValue({ in: mockIn })

    await logPaymentRequestSent(['charge-1', 'charge-2'], 'org-1', 'profile-1')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        sent_at: expect.any(String),
        sent_by_profile_id: 'profile-1',
      })
    )
    expect(mockIn).toHaveBeenCalledWith('id', ['charge-1', 'charge-2'])
  })

  it('returns early when there are no charge ids', async () => {
    await logPaymentRequestSent([], 'org-1', 'profile-1')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('idempotent: does not change status or amount (only metadata)', async () => {
    const inChain = { eq: mockEq }
    mockEq.mockResolvedValue({ error: null })
    mockIn.mockReturnValue(inChain)
    mockUpdate.mockReturnValue({ in: mockIn })

    // Call twice
    await logPaymentRequestSent(['charge-1'], 'org-1', 'profile-1')
    await logPaymentRequestSent(['charge-1'], 'org-1', 'profile-1')

    // Both calls update only metadata fields — never status or amount
    for (const call of mockUpdate.mock.calls) {
      const updatePayload = call[0]
      expect(updatePayload).not.toHaveProperty('status')
      expect(updatePayload).not.toHaveProperty('amount')
      expect(updatePayload).toHaveProperty('sent_at')
      expect(updatePayload).toHaveProperty('sent_by_profile_id')
    }
    expect(mockUpdate).toHaveBeenCalledTimes(2)
  })
})
