import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmBooking, LockExpiredError, InactiveParticipantError, NoPrimaryParentError } from './confirmBooking'
import { LessonConflictError } from '@/lib/lessons/createLesson'
import { WeeklyQuotaExceededError } from './weeklyQuota'

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

// validateSlotLock is imported inside confirmBooking — mock it
vi.mock('./validateSlotLock', () => ({
  validateSlotLock: vi.fn(),
}))

// The quota rule has its own suite; here it only needs to be steerable.
vi.mock('./weeklyQuota', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./weeklyQuota')>()),
  assertWeeklyQuotaNotExceeded: vi.fn(),
}))

import { validateSlotLock } from './validateSlotLock'
import { assertWeeklyQuotaNotExceeded } from './weeklyQuota'
const mockValidateLock = vi.mocked(validateSlotLock)
const mockAssertQuota = vi.mocked(assertWeeklyQuotaNotExceeded)

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
  ;['select', 'eq', 'maybeSingle', 'update', 'insert', 'neq', 'lt', 'gt', 'limit', 'in'].forEach(m => { self[m] = pass })
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

  it('refuses the booking when the student has used up the week', async () => {
    mockValidateLock.mockResolvedValue({ valid: true, lock: validLock })
    mockAssertQuota.mockRejectedValueOnce(new WeeklyQuotaExceededError(1, 1))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'teachers') return buildChain({ data: { id: TEACHER_ID, is_active: true }, error: null })
      if (table === 'students') return buildChain({ data: { id: STUDENT_ID, is_active: true }, error: null })
      return buildChain({ data: null, error: null })
    })

    await expect(confirmBooking(PARAMS)).rejects.toThrow(WeeklyQuotaExceededError)
    // The quota is judged on the locked slot's week, not on today.
    expect(mockAssertQuota).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: STUDENT_ID, slotStartUtc: START })
    )
  })

  it('refuses a second lesson for the same student at the same hour', async () => {
    mockValidateLock.mockResolvedValue({ valid: true, lock: validLock })
    let lessonQueries = 0

    mockFrom.mockImplementation((table: string) => {
      if (table === 'teachers') return buildChain({ data: { id: TEACHER_ID, is_active: true }, error: null })
      if (table === 'students') return buildChain({ data: { id: STUDENT_ID, is_active: true }, error: null })
      if (table === 'relationships') return buildChain({ data: { parent_id: PARENT_ID }, error: null })
      if (table === 'lesson_students') return buildChain({ data: [{ lesson_id: 'other-lesson' }], error: null })
      if (table === 'lessons') {
        // Teacher overlap query runs first and finds nothing; the student
        // overlap query then finds the lesson booked with another teacher.
        const isStudentOverlapQuery = lessonQueries++ > 0
        return buildChain({
          data: isStudentOverlapQuery ? [{ id: 'other-lesson' }] : [],
          error: null,
        })
      }
      return buildChain({ data: null, error: null })
    })

    await expect(confirmBooking(PARAMS)).rejects.toMatchObject({
      name: 'LessonConflictError',
      reason: 'student_conflict',
    })
  })

  it('reports a lost race on the exclusion constraint as a conflict, not a server error', async () => {
    mockValidateLock.mockResolvedValue({ valid: true, lock: validLock })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'teachers') return buildChain({ data: { id: TEACHER_ID, is_active: true }, error: null })
      if (table === 'students') return buildChain({ data: { id: STUDENT_ID, is_active: true }, error: null })
      if (table === 'relationships') return buildChain({ data: { parent_id: PARENT_ID }, error: null })
      if (table === 'lessons') {
        const chain = buildChain({ data: [], error: null }) as Record<string, unknown>
        chain['insert'] = () => ({
          select: () =>
            buildChain({ data: null, error: { code: '23P01', message: 'conflicting key value' } }),
        })
        return chain
      }
      return buildChain({ data: null, error: null })
    })

    await expect(confirmBooking(PARAMS)).rejects.toThrow(LessonConflictError)
  })

  it('deletes the lesson when the student cannot be linked to it', async () => {
    mockValidateLock.mockResolvedValue({ valid: true, lock: validLock })

    const deleteEq = vi.fn(() => Promise.resolve({ error: null }))
    const lessonDelete = vi.fn(() => ({ eq: deleteEq }))

    mockFrom.mockImplementation((table: string) => {
      if (table === 'teachers') return buildChain({ data: { id: TEACHER_ID, is_active: true }, error: null })
      if (table === 'students') return buildChain({ data: { id: STUDENT_ID, is_active: true }, error: null })
      if (table === 'relationships') return buildChain({ data: { parent_id: PARENT_ID }, error: null })
      if (table === 'lesson_students') {
        const chain = buildChain({ data: null, error: null }) as Record<string, unknown>
        chain['insert'] = () => Promise.resolve({ error: { message: 'link failed' } })
        return chain
      }
      if (table === 'lessons') {
        const chain = buildChain({ data: [], error: null }) as Record<string, unknown>
        chain['insert'] = () => ({
          select: () =>
            buildChain({
              data: { id: 'lesson-1', teacher_id: TEACHER_ID, start_at: START, end_at: END },
              error: null,
            }),
        })
        chain['delete'] = lessonDelete
        return chain
      }
      return buildChain({ data: null, error: null })
    })

    await expect(confirmBooking(PARAMS)).rejects.toThrow('Failed to link student to lesson')
    // Otherwise the calendar keeps a lesson nobody is enrolled in.
    expect(lessonDelete).toHaveBeenCalled()
    expect(deleteEq).toHaveBeenCalledWith('id', 'lesson-1')
  })
})
