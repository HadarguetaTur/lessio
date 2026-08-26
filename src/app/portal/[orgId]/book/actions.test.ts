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
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/booking', () => ({
  getAvailableSlots: vi.fn(),
  getAvailabilitySummary: vi.fn(),
  createSlotLock: mockCreateSlotLock,
  confirmBooking: mockConfirmBooking,
}))

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
    await portalLockSlotAction(ORG, 'teacher-1', 'start', 'end', YUVAL)

    expect(mockCreateSlotLock).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: YUVAL, organizationId: ORG })
    )
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
    expect(result.studentId).toBe(YUVAL)
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
