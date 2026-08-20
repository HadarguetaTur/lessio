import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPaymentRequestMessage, logPaymentRequestSent, getPendingChargesForParent } from './index'
import type { PaymentRequestCharge } from './index'

// ── Mock clients for logPaymentRequestSent ────────────────────────────────────

const mockUpdate = vi.fn()
const mockIn = vi.fn()
const mockEq = vi.fn()

/**
 * Rows the mocked `charges` and `relationships` selects resolve to. Set per test
 * by the getPendingChargesForParent suite; the other suites never read them.
 */
let chargesRows: unknown[] = []
let relationshipRows: Array<{ student_id: string }> = []

/**
 * Minimal PostgREST builder stand-in: every filter returns `this`, and the
 * builder itself is awaited at the end of the chain.
 */
function selectStub(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['eq', 'in', 'order']) {
    builder[method] = () => builder
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null })
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({
    from: (table: string) => ({
      update: mockUpdate,
      select: () => selectStub(table === 'relationships' ? relationshipRows : chargesRows),
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
    expect(msg).toContain('היי שרה כהן')
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

  it('labels monthly charges correctly', () => {
    const monthlyCharge: PaymentRequestCharge[] = [{
      id: 'charge-4',
      amount: 320,
      charge_type: 'monthly',
      lesson_start_at: null,
      student_name: null,
    }]
    const msg = buildPaymentRequestMessage('אבי לוי', monthlyCharge, 'Asia/Jerusalem')
    expect(msg).toContain('חיוב חודשי')
    expect(msg).toContain('₪320.00')
  })
})

// ── getPendingChargesForParent ────────────────────────────────────────────────

describe('getPendingChargesForParent', () => {
  beforeEach(() => {
    chargesRows = []
    relationshipRows = []
  })

  it('resolves the student name through lesson_students', async () => {
    relationshipRows = [{ student_id: 'student-1' }]
    chargesRows = [{
      id: 'charge-1',
      amount: '180',
      charge_type: 'lesson',
      lesson_id: 'lesson-1',
      lessons: {
        start_at: '2026-01-05T14:00:00.000Z',
        lesson_students: [
          { student_id: 'student-1', students: { full_name: 'דניאל אדמס' } },
        ],
      },
    }]

    const [charge] = await getPendingChargesForParent('parent-1', 'org-1')

    expect(charge.student_name).toBe('דניאל אדמס')
    expect(charge.lesson_start_at).toBe('2026-01-05T14:00:00.000Z')
    expect(charge.amount).toBe(180)
  })

  it('never names a student from another family on a group lesson', async () => {
    relationshipRows = [{ student_id: 'student-mine' }]
    chargesRows = [{
      id: 'charge-1',
      amount: '180',
      charge_type: 'lesson',
      lesson_id: 'lesson-1',
      lessons: {
        start_at: '2026-01-05T14:00:00.000Z',
        lesson_students: [
          // Enrolled first, and belongs to a different parent.
          { student_id: 'student-theirs', students: { full_name: 'ילד של משפחה אחרת' } },
          { student_id: 'student-mine', students: { full_name: 'מאיה אדמס' } },
        ],
      },
    }]

    const [charge] = await getPendingChargesForParent('parent-1', 'org-1')

    expect(charge.student_name).toBe('מאיה אדמס')
  })

  it('falls back to a null name when no enrolled student belongs to the parent', async () => {
    relationshipRows = [{ student_id: 'student-mine' }]
    chargesRows = [{
      id: 'charge-1',
      amount: '180',
      charge_type: 'lesson',
      lesson_id: 'lesson-1',
      lessons: {
        start_at: '2026-01-05T14:00:00.000Z',
        lesson_students: [
          { student_id: 'student-theirs', students: { full_name: 'ילד של משפחה אחרת' } },
        ],
      },
    }]

    const [charge] = await getPendingChargesForParent('parent-1', 'org-1')

    expect(charge.student_name).toBeNull()
  })

  it('handles charges with no lesson at all (manual / monthly)', async () => {
    relationshipRows = [{ student_id: 'student-1' }]
    chargesRows = [{
      id: 'charge-1',
      amount: '320',
      charge_type: 'monthly',
      lesson_id: null,
      lessons: null,
    }]

    const [charge] = await getPendingChargesForParent('parent-1', 'org-1')

    expect(charge.student_name).toBeNull()
    expect(charge.lesson_start_at).toBeNull()
    expect(charge.charge_type).toBe('monthly')
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
