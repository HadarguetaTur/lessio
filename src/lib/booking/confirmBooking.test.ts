import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmBooking, LockExpiredError, InactiveParticipantError, NoPrimaryParentError } from './confirmBooking'

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

// validateSlotLock is imported inside confirmBooking — mock it
vi.mock('./validateSlotLock', () => ({
  validateSlotLock: vi.fn(),
}))

import { validateSlotLock } from './validateSlotLock'
const mockValidateLock = vi.mocked(validateSlotLock)

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1'
const LOCK_ID = 'lock-1'
const TEACHER_ID = 'teacher-1'
const STUDENT_ID = 'student-1'
const PARENT_ID = 'parent-1'
const START = '2026-03-23T16:00:00.000Z'
const END = '2026-03-23T17:00:00.000Z'
const futureExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString()

const validLock = {
  id: LOCK_ID, teacher_id: TEACHER_ID, student_id: STUDENT_ID,
  start_at: START, end_at: END, expires_at: futureExpiry,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'maybeSingle', 'update', 'insert', 'neq'].forEach(m => { self[m] = pass })
  self['single']      = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return self
}

const PARAMS = {
  lockId: LOCK_ID,
  studentId: STUDENT_ID,
  teacherId: TEACHER_ID,
  organizationId: ORG_ID,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('confirmBooking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a lesson and consumes the lock on success', async () => {
    mockValidateLock.mockResolvedValue({ valid: true, lock: validLock })

    const createdLesson = {
      id: 'lesson-1', teacher_id: TEACHER_ID, student_id: STUDENT_ID,
      start_at: START, end_at: END,
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'teachers') return buildChain({ data: { id: TEACHER_ID, is_active: true }, error: null })
      if (table === 'students') return buildChain({ data: { id: STUDENT_ID, is_active: true }, error: null })
      if (table === 'relationships') return buildChain({ data: { parent_id: PARENT_ID }, error: null })
      if (table === 'lessons') {
        const chain = buildChain({ data: [], error: null }) as Record<string, unknown>
        chain['insert'] = () => ({
          select: () => buildChain({ data: createdLesson, error: null }),
        })
        return chain
      }
      if (table === 'slot_locks') {
        const chain = buildChain({ data: null, error: null }) as Record<string, unknown>
        chain['update'] = () => chain
        return chain
      }
      return buildChain({ data: null, error: null })
    })

    const result = await confirmBooking(PARAMS)

    expect(result.lessonId).toBe('lesson-1')
    expect(result.teacherId).toBe(TEACHER_ID)
    expect(result.studentId).toBe(STUDENT_ID)
    expect(result.startAt).toBe(START)
    expect(result.endAt).toBe(END)
  })

  it('throws LockExpiredError when the lock is expired', async () => {
    mockValidateLock.mockResolvedValue({ valid: false, reason: 'expired' })

    await expect(confirmBooking(PARAMS)).rejects.toThrow(LockExpiredError)
  })

  it('throws LockExpiredError when the lock is consumed', async () => {
    mockValidateLock.mockResolvedValue({ valid: false, reason: 'consumed' })

    await expect(confirmBooking(PARAMS)).rejects.toThrow(LockExpiredError)
  })

  it('throws LockExpiredError when the lock is not found', async () => {
    mockValidateLock.mockResolvedValue({ valid: false, reason: 'not_found' })

    await expect(confirmBooking(PARAMS)).rejects.toThrow(LockExpiredError)
  })

  it('throws InactiveParticipantError when teacher is not active', async () => {
    mockValidateLock.mockResolvedValue({ valid: true, lock: validLock })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'teachers') return buildChain({ data: { id: TEACHER_ID, is_active: false }, error: null })
      return buildChain({ data: null, error: null })
    })

    await expect(confirmBooking(PARAMS)).rejects.toThrow(InactiveParticipantError)
  })

  it('throws InactiveParticipantError when teacher does not exist in org', async () => {
    mockValidateLock.mockResolvedValue({ valid: true, lock: validLock })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'teachers') return buildChain({ data: null, error: { message: 'not found' } })
      return buildChain({ data: null, error: null })
    })

    await expect(confirmBooking(PARAMS)).rejects.toThrow(InactiveParticipantError)
  })

  it('throws InactiveParticipantError when student is not active', async () => {
    mockValidateLock.mockResolvedValue({ valid: true, lock: validLock })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'teachers') return buildChain({ data: { id: TEACHER_ID, is_active: true }, error: null })
      if (table === 'students') return buildChain({ data: { id: STUDENT_ID, is_active: false }, error: null })
      return buildChain({ data: null, error: null })
    })

    await expect(confirmBooking(PARAMS)).rejects.toThrow(InactiveParticipantError)
  })

  it('throws NoPrimaryParentError when student has no primary parent', async () => {
    mockValidateLock.mockResolvedValue({ valid: true, lock: validLock })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'teachers') return buildChain({ data: { id: TEACHER_ID, is_active: true }, error: null })
      if (table === 'students') return buildChain({ data: { id: STUDENT_ID, is_active: true }, error: null })
      if (table === 'relationships') return buildChain({ data: null, error: null }) // no primary parent
      return buildChain({ data: null, error: null })
    })

    await expect(confirmBooking(PARAMS)).rejects.toThrow(NoPrimaryParentError)
  })
})
