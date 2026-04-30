import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock service-role client
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

// Spy on calculateCancellationCharge to verify reuse
vi.mock('@/lib/billing/calculateCancellationCharge', async () => {
  const actual = await vi.importActual('@/lib/billing/calculateCancellationCharge')
  const actualMod = actual as { calculateCancellationCharge: (...args: unknown[]) => unknown }
  return {
    ...actual,
    calculateCancellationCharge: vi.fn(actualMod.calculateCancellationCharge),
  }
})

// Spy on createCancellationCharge
const mockCreateCancellationCharge = vi.fn().mockResolvedValue(null)
vi.mock('@/lib/billing/createCharge', () => ({
  createCancellationCharge: (...args: unknown[]) => mockCreateCancellationCharge(...args),
}))

import { executeCancellation } from './executeCancellation'
import { calculateCancellationCharge } from '@/lib/billing/calculateCancellationCharge'

const mockCalculate = vi.mocked(calculateCancellationCharge)

// Lesson 2 hours from now
const FUTURE_START = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
const FUTURE_END = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()

const MOCK_LESSON = {
  id: 'lesson-1',
  start_at: FUTURE_START,
  end_at: FUTURE_END,
  status: 'scheduled',
  lesson_students: [{ student_id: 'student-1', students: { full_name: 'ישראל ישראלי' } }],
  teachers: { id: 'teacher-1', hourly_rate: 200, profiles: { full_name: 'שרה כהן' } },
}

const MOCK_POLICY = {
  id: 'policy-1',
  notice_hours_full: 24,
  notice_hours_partial: 2,
  partial_charge_percent: 50,
}

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'order', 'insert', 'update', 'delete', 'upsert'].forEach(m => { self[m] = pass })
  self['maybeSingle'] = () => Promise.resolve(result)
  self['single'] = () => Promise.resolve(result)
  return self
}

describe('executeCancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCancellationCharge.mockResolvedValue(null)
  })

  it('returns not_found when lesson does not exist', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: null, error: { message: 'not found' } }))
    const result = await executeCancellation('lesson-x', 'parent-1', 'org-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('not_found')
  })

  it('returns already_cancelled for an already-cancelled lesson (idempotency)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') return buildChain({ data: { ...MOCK_LESSON, status: 'cancelled' }, error: null })
      return buildChain({ data: null, error: null })
    })
    const result = await executeCancellation('lesson-1', 'parent-1', 'org-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('already_cancelled')
    expect(mockCreateCancellationCharge).not.toHaveBeenCalled()
  })

  it('returns not_eligible when lesson is not scheduled', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') return buildChain({ data: { ...MOCK_LESSON, status: 'completed' }, error: null })
      return buildChain({ data: null, error: null })
    })
    const result = await executeCancellation('lesson-1', 'parent-1', 'org-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('not_eligible')
    expect(mockCreateCancellationCharge).not.toHaveBeenCalled()
  })

  it('returns not_eligible when lesson does not belong to parent', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') return buildChain({ data: MOCK_LESSON, error: null })
      if (table === 'relationships') return buildChain({ data: null, error: null })
      return buildChain({ data: null, error: null })
    })
    const result = await executeCancellation('lesson-1', 'parent-1', 'org-1')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('not_eligible')
  })

  it('succeeds, calls calculateCancellationCharge (policy reuse from Sprint 3), creates charge', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') return buildChain({ data: MOCK_LESSON, error: null })
      if (table === 'relationships') return buildChain({ data: { id: 'rel-1' }, error: null })
      if (table === 'cancellation_policies') return buildChain({ data: MOCK_POLICY, error: null })
      return buildChain({ data: null, error: null })
    })

    const result = await executeCancellation('lesson-1', 'parent-1', 'org-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.studentName).toBe('ישראל ישראלי')
      expect(result.teacherName).toBe('שרה כהן')
      expect(result.chargeResult).toBeDefined()
    }
    // Verifies that the Sprint 3 function is being reused (not a reimplementation)
    expect(mockCalculate).toHaveBeenCalledWith(
      expect.objectContaining({ start_at: FUTURE_START, end_at: FUTURE_END }),
      expect.any(Date),
      MOCK_POLICY
    )
  })

  it('does not create charge when lesson is outside policy window', async () => {
    // Lesson 48 hours from now, policy full_notice = 24h → outside window → no charge
    const farFuture = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const farFutureEnd = new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') return buildChain({ data: { ...MOCK_LESSON, start_at: farFuture, end_at: farFutureEnd }, error: null })
      if (table === 'relationships') return buildChain({ data: { id: 'rel-1' }, error: null })
      if (table === 'cancellation_policies') return buildChain({ data: MOCK_POLICY, error: null })
      return buildChain({ data: null, error: null })
    })

    const result = await executeCancellation('lesson-1', 'parent-1', 'org-1')
    expect(result.success).toBe(true)
    expect(mockCreateCancellationCharge).not.toHaveBeenCalled()
  })
})
