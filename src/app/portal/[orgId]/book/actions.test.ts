import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRedirect,
  mockGetPortalSession,
  mockCreateServiceRoleClient,
  mockCreateSlotLock,
  mockConfirmBooking,
} = vi.hoisted(() => ({
  mockRedirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
  mockGetPortalSession: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCreateSlotLock: vi.fn(),
  mockConfirmBooking: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/portal/session', () => ({ getPortalSession: mockGetPortalSession }))
// Booking is on for these orgs; the toggle itself is covered in portalSettings.test.ts.
vi.mock('@/lib/portal/features', () => ({
  requirePortalFeature: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
// The error classes stay real — the action matches on them with instanceof.
vi.mock('@/lib/booking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/booking')>()),
  getAvailableSlots: vi.fn(),
  getAvailabilitySummary: vi.fn(),
  createSlotLock: mockCreateSlotLock,
  confirmBooking: mockConfirmBooking,
}))

import {
  LockExpiredError,
  SlotUnavailableError,
  WeeklyQuotaExceededError,
} from '@/lib/booking'
import { LessonConflictError } from '@/lib/lessons/createLesson'
import { portalLockSlotAction, portalConfirmBookingAction } from './actions'

const ORG = 'org-1'
const PARENT = 'parent-1'
const NOA = 'student-noa'
const YUVAL = 'student-yuval'

/**
 * Yael has two children. The flow used to resolve the student from
 * `relationships.is_primary` — the primary-*payer* flag — so it silently
 * booked for whichever row happened to carry it.
 */
function relationshipsClient(ownedStudentIds: string[]) {
  return {
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {}
      let requestedStudentId: string | null = null
      Object.assign(builder, {
        eq: vi.fn((column: string, value: string) => {
          if (column === 'student_id') requestedStudentId = value
          return builder
        }),
        maybeSingle: vi.fn(async () => ({
          data:
            requestedStudentId && ownedStudentIds.includes(requestedStudentId)
              ? { id: 'rel-1' }
              : null,
          error: null,
        })),
      })
      return { select: vi.fn(() => builder) }
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPortalSession.mockResolvedValue({ parentId: PARENT, orgId: ORG })
  mockCreateServiceRoleClient.mockReturnValue(relationshipsClient([NOA, YUVAL]))
  mockCreateSlotLock.mockResolvedValue({ id: 'lock-1' })
  mockConfirmBooking.mockResolvedValue({
    lessonId: 'lesson-1',
    teacherId: 'teacher-1',
    studentId: YUVAL,
    startAt: '2026-08-28T13:00:00.000Z',
    endAt: '2026-08-28T14:00:00.000Z',
  })
})

describe('portalLockSlotAction', () => {
  it('holds the slot for the child the parent picked', async () => {
    const result = await portalLockSlotAction(ORG, 'teacher-1', 'start', 'end', YUVAL)

    expect(mockCreateSlotLock).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: YUVAL, organizationId: ORG })
    )
    expect(result).toEqual({ success: true, lock: { id: 'lock-1' } })
  })

  it('reports a filled weekly quota as its own outcome', async () => {
    mockCreateSlotLock.mockRejectedValue(new WeeklyQuotaExceededError(1, 1))

    const result = await portalLockSlotAction(ORG, 'teacher-1', 'start', 'end', YUVAL)

    expect(result).toEqual({ success: false, error: 'quota_exceeded' })
  })

  it('reports a slot someone else just took', async () => {
    mockCreateSlotLock.mockRejectedValue(new SlotUnavailableError())

    const result = await portalLockSlotAction(ORG, 'teacher-1', 'start', 'end', YUVAL)

    expect(result).toEqual({ success: false, error: 'unavailable' })
  })

  it('refuses a student who is not this parent’s child', async () => {
    mockCreateServiceRoleClient.mockReturnValue(relationshipsClient([NOA]))

    await expect(
      portalLockSlotAction(ORG, 'teacher-1', 'start', 'end', 'someone-elses-child')
    ).rejects.toThrow('student_not_owned')
    expect(mockCreateSlotLock).not.toHaveBeenCalled()
  })
})

describe('portalConfirmBookingAction', () => {
  it('books the child the parent picked, not the first relationship row', async () => {
    const result = await portalConfirmBookingAction(ORG, 'lock-1', 'teacher-1', YUVAL)

    expect(mockConfirmBooking).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: YUVAL, lockId: 'lock-1', organizationId: ORG })
    )
    expect(result.success && result.result.studentId).toBe(YUVAL)
  })

  it('names the reason a confirm failed instead of throwing', async () => {
    // Server Action error messages are masked in production, so every failure
    // the parent should see has to come back as a tagged result.
    const cases = [
      [new WeeklyQuotaExceededError(1, 1), 'quota_exceeded'],
      [new LessonConflictError('teacher_conflict'), 'slot_taken'],
      [new LessonConflictError('student_conflict'), 'student_conflict'],
      [new LockExpiredError('expired'), 'lock_expired'],
    ] as const

    for (const [thrown, expected] of cases) {
      mockConfirmBooking.mockRejectedValueOnce(thrown)
      const result = await portalConfirmBookingAction(ORG, 'lock-1', 'teacher-1', YUVAL)
      expect(result).toEqual({ success: false, error: expected })
    }
  })

  it('refuses a student who is not this parent’s child', async () => {
    mockCreateServiceRoleClient.mockReturnValue(relationshipsClient([NOA]))

    await expect(
      portalConfirmBookingAction(ORG, 'lock-1', 'teacher-1', 'someone-elses-child')
    ).rejects.toThrow('student_not_owned')
    expect(mockConfirmBooking).not.toHaveBeenCalled()
  })

  it('bounces an expired portal session to login instead of throwing', async () => {
    mockGetPortalSession.mockResolvedValue(null)

    await expect(
      portalConfirmBookingAction(ORG, 'lock-1', 'teacher-1', YUVAL)
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith(`/portal/${ORG}/login`)
  })
})
