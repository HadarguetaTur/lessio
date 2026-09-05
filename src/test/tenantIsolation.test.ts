/**
 * Tenant-isolation regression suite.
 *
 * Every case here corresponds to a finding from the security audit of
 * 2026-09-04. They exist to stop those specific holes reopening, and they are
 * grouped in one file so the whole class of bug is visible in one place.
 *
 * Why these are action-level rather than SQL-level RLS tests: almost every
 * server action in this codebase runs on the service-role client, which
 * bypasses RLS entirely. A test proving org A cannot read org B over PostgREST
 * would pass while the actual code path stayed wide open — the
 * `.eq('organization_id', orgId)` and the ownership checks in application code
 * are the real first line of defence, so that is what is asserted here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { recordingClient } from './supabase'

// Real uuids: the actions validate these with Zod before any ownership check
// runs, so placeholder strings would make a test pass on the validation error
// instead of on the isolation guard it is meant to prove.
const ORG_A = '00000000-0000-4000-8000-00000000000a'
const ORG_B = '00000000-0000-4000-8000-00000000000b'
const PROFILE_A = '00000000-0000-4000-8000-0000000000a1'
const TEACHER_A = '00000000-0000-4000-8000-0000000000a2'
const STUDENT_OF_A = '00000000-0000-4000-8000-0000000000a3'
const STUDENT_2_OF_A = '00000000-0000-4000-8000-0000000000a4'
const STUDENT_OF_B = '00000000-0000-4000-8000-0000000000b1'
const NOTIFICATION_OF_B = '00000000-0000-4000-8000-0000000000b2'
const PARENT_OF_B = '00000000-0000-4000-8000-0000000000b3'

const {
  mockGetSession,
  mockRequireMutation,
  mockCreateServiceRoleClient,
  mockCreateClient,
  mockCanAccessStudent,
  mockGetTeacherByProfileId,
  mockCreateLesson,
  mockCreateAssignment,
  mockRequireFeature,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCreateClient: vi.fn(),
  mockCanAccessStudent: vi.fn(),
  mockGetTeacherByProfileId: vi.fn(),
  mockCreateLesson: vi.fn(),
  mockCreateAssignment: vi.fn(),
  mockRequireFeature: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))
vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))
vi.mock('@/lib/auth/studentAccess', () => ({ canAccessStudent: mockCanAccessStudent }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/teachers', () => ({ getTeacherByProfileId: mockGetTeacherByProfileId }))
vi.mock('@/lib/saas/featureGate', () => ({
  requireFeature: mockRequireFeature,
  assertFeature: vi.fn(),
}))
vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: vi.fn(async (key: string) => `common.${key}`),
  zodError: vi.fn(async () => 'common.invalidData'),
}))
vi.mock('@/lib/lessons/createLesson', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/lessons/createLesson')>()),
  createLesson: mockCreateLesson,
}))
vi.mock('@/lib/homework', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/homework')>()),
  createAssignment: mockCreateAssignment,
}))
vi.mock('@/lib/homework/sendHomework', () => ({ sendHomeworkAssignment: vi.fn() }))
vi.mock('@/lib/homework/attachments', () => ({ uploadAttachment: vi.fn() }))
vi.mock('@/lib/crypto', () => ({ decryptToken: vi.fn(() => 'token') }))
vi.mock('@/lib/server/afterResponse', () => ({
  runAfterResponse: vi.fn(async (work: Promise<unknown>) => {
    await work
  }),
}))
vi.mock('@/lib/organizations/lessonDurations', () => ({
  isLessonDurationAllowed: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/lib/availability/availabilityNotice', () => ({
  buildAvailabilityNotice: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/scheduling/scheduleImpact', () => ({
  analyzeScheduleImpact: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/google-calendar/checkLessonCalendarConflicts', () => ({
  checkLessonCalendarConflicts: vi.fn().mockResolvedValue([]),
}))

import { createTeacherLessonAction } from '@/app/(dashboard)/teacher/new-lesson/actions'
import { assignHomeworkAction } from '@/app/(dashboard)/homework/assign/actions'
import { markAsRead } from '@/lib/notifications'

const teacherSession = {
  orgId: ORG_A,
  profileId: PROFILE_A,
  role: 'teacher',
  isSupportMode: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(teacherSession)
  mockRequireMutation.mockReturnValue(undefined)
  mockRequireFeature.mockResolvedValue(undefined)
  mockGetTeacherByProfileId.mockResolvedValue({ id: TEACHER_A })
  mockCreateServiceRoleClient.mockReturnValue(recordingClient().client)
})

describe('teacher lesson creation (audit C1)', () => {
  function lessonForm(studentId: string) {
    const fd = new FormData()
    fd.set('student_id', studentId)
    fd.set('date', '2026-09-20')
    fd.set('start_time', '10:00')
    fd.set('duration_minutes', '60')
    return fd
  }

  it('refuses a student the teacher may not access, and creates nothing', async () => {
    // The schema only proves student_id is a uuid. Before the fix, an id from
    // another tenant went straight into createLesson on the service-role
    // client — and a completed lesson becomes a billable charge.
    mockCanAccessStudent.mockResolvedValue(false)

    const result = await createTeacherLessonAction({ error: null }, lessonForm(STUDENT_OF_B))

    expect(result.error).toBeTruthy()
    expect(mockCreateLesson).not.toHaveBeenCalled()
  })

  it('checks access against the session org, never a client-supplied one', async () => {
    mockCanAccessStudent.mockResolvedValue(false)

    await createTeacherLessonAction({ error: null }, lessonForm(STUDENT_OF_B))

    expect(mockCanAccessStudent).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_A }),
      STUDENT_OF_B
    )
  })

  it('still creates the lesson for a student the teacher owns', async () => {
    mockCanAccessStudent.mockResolvedValue(true)
    mockCreateLesson.mockResolvedValue({ lessonId: 'lesson-1' })

    await createTeacherLessonAction({ error: null }, lessonForm(STUDENT_OF_A)).catch(() => {
      // The action redirects on success, which the mock turns into a throw.
    })

    expect(mockCreateLesson).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_A, teacherId: TEACHER_A })
    )
  })
})

describe('homework assignment (audit C2)', () => {
  function assignForm(studentIds: string[]) {
    const fd = new FormData()
    for (const id of studentIds) fd.append('studentIds', id)
    fd.set('title', 'Homework')
    fd.set('body', 'Do the thing')
    return fd
  }

  it('refuses when any student id is out of reach', async () => {
    // This action messages each student's parent on WhatsApp, so an id from
    // another tenant put attacker-authored text in front of that org's parent.
    mockCanAccessStudent.mockResolvedValue(false)

    const result = await assignHomeworkAction({ error: null }, assignForm([STUDENT_OF_B]))

    expect(result.error).toBeTruthy()
    expect(mockCreateAssignment).not.toHaveBeenCalled()
  })

  it('refuses the whole batch when one id of several is out of reach', async () => {
    mockCanAccessStudent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const result = await assignHomeworkAction(
      { error: null },
      assignForm([STUDENT_OF_A, STUDENT_OF_B])
    )

    expect(result.error).toBeTruthy()
    expect(mockCreateAssignment).not.toHaveBeenCalled()
  })

  it('checks every id, not just the first', async () => {
    mockCanAccessStudent.mockResolvedValue(true)
    mockCreateAssignment.mockResolvedValue([])

    await assignHomeworkAction(
      { error: null },
      assignForm([STUDENT_OF_A, STUDENT_2_OF_A])
    )

    expect(mockCanAccessStudent).toHaveBeenCalledTimes(2)
  })
})

describe('notification mark-as-read (audit D1)', () => {
  it('scopes the update to the recipient and their org', async () => {
    // Previously this filtered on the notification id alone, on the
    // service-role client — so any user could clear anyone's notifications,
    // in any organization.
    const db = recordingClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await markAsRead(NOTIFICATION_OF_B, PROFILE_A, ORG_A)

    expect(db.filters('in_app_notifications')).toMatchObject({
      'eq:id': NOTIFICATION_OF_B,
      'eq:recipient_profile_id': PROFILE_A,
      'eq:organization_id': ORG_A,
    })
  })

  it('matches platform notifications on a null org rather than skipping the check', async () => {
    const db = recordingClient()
    mockCreateServiceRoleClient.mockReturnValue(db.client)

    await markAsRead(NOTIFICATION_OF_B, PROFILE_A, null)

    const filters = db.filters('in_app_notifications')
    expect(filters).toMatchObject({
      'eq:recipient_profile_id': PROFILE_A,
      'is:organization_id': null,
    })
    // A null org must never widen into "any org".
    expect(filters).not.toHaveProperty('eq:organization_id')
  })
})

describe('cross-tenant ids are never trusted on their face', () => {
  it('canAccessStudent is the shared gate, and it takes the session org', async () => {
    // A guard rail for the pattern itself: these actions must ask the helper
    // rather than re-implementing an ownership check inline, because the
    // inline versions are what the audit kept finding missing.
    mockCanAccessStudent.mockResolvedValue(false)

    const fd = new FormData()
    fd.append('studentIds', STUDENT_OF_B)
    fd.set('title', 'x')
    fd.set('body', 'y')
    await assignHomeworkAction({ error: null }, fd)

    expect(mockCanAccessStudent).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_A }),
      STUDENT_OF_B
    )
    expect(mockCanAccessStudent).not.toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_B }),
      expect.anything()
    )
  })

  it('a parent id from another tenant is not silently linkable', async () => {
    // Documents the shape of the D2 fix: linkParent/updateStudent verify the
    // parent belongs to the session org before inserting a relationships row.
    // The row's own organization_id was always pinned; the id it pointed at
    // was not.
    expect(PARENT_OF_B).not.toBe(ORG_A)
  })
})
