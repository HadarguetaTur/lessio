import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockGetLessonById,
  mockGetTeacherByProfileId,
  mockRecordLessonOutcome,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetLessonById: vi.fn(),
  mockGetTeacherByProfileId: vi.fn(),
  mockRecordLessonOutcome: vi.fn(),
  mockRevalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getSession: mockGetSession, requireMutation: vi.fn() }))
vi.mock('@/lib/lessons', () => ({
  getLessonById: mockGetLessonById,
  getLessonTitle: vi.fn(),
}))
vi.mock('@/lib/teachers', () => ({ getTeacherByProfileId: mockGetTeacherByProfileId }))
vi.mock('@/lib/lessons/outcome', () => ({ recordLessonOutcome: mockRecordLessonOutcome }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn().mockResolvedValue((key: string) => key) }))

import { updateTeacherLessonOutcome } from './actions'

const TEACHER_RECORD = { id: 'teacher-1', is_active: true }
const LESSON_OWN = {
  id: 'lesson-1',
  status: 'scheduled',
  teacher: { id: 'teacher-1', full_name: 'מורה א', color: null },
  students: [{ id: 'student-1', full_name: 'תלמיד א' }],
  group: null,
  start_at: '2026-03-24T10:00:00Z',
  end_at: '2026-03-24T11:00:00Z',
  cancel_reason: null,
}
const LESSON_OTHER_TEACHER = { ...LESSON_OWN, teacher: { id: 'teacher-99', full_name: 'מורה אחר', color: null } }

const prevState = { error: null }

function makeFormData(status: string, present?: string[]) {
  const fd = new FormData()
  fd.set('status', status)
  if (present) {
    fd.set('attendance_form', '1')
    for (const id of present) fd.append('present', id)
  }
  return fd
}

describe('updateTeacherLessonOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ userId: 'profile-1', profileId: 'profile-1', orgId: 'org-1', role: 'teacher' })
    mockGetTeacherByProfileId.mockResolvedValue(TEACHER_RECORD)
    mockGetLessonById.mockResolvedValue(LESSON_OWN)
    mockRecordLessonOutcome.mockResolvedValue({ status: 'completed', chargeAlert: null })
  })

  // --- Role and ownership gates ---

  it('returns an error for non-teacher role (owner)', async () => {
    mockGetSession.mockResolvedValue({ userId: 'profile-1', orgId: 'org-1', role: 'owner' })
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
    expect(mockRecordLessonOutcome).not.toHaveBeenCalled()
  })

  it('returns an error for non-teacher role (admin)', async () => {
    mockGetSession.mockResolvedValue({ userId: 'profile-1', orgId: 'org-1', role: 'admin' })
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
    expect(mockRecordLessonOutcome).not.toHaveBeenCalled()
  })

  it('blocks update when lesson belongs to a different teacher — teacher isolation', async () => {
    mockGetLessonById.mockResolvedValue(LESSON_OTHER_TEACHER)
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
    expect(mockRecordLessonOutcome).not.toHaveBeenCalled()
  })

  it('blocks update when the teacher record is archived', async () => {
    mockGetTeacherByProfileId.mockResolvedValue(null)
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
    expect(mockRecordLessonOutcome).not.toHaveBeenCalled()
  })

  it.each(['cancelled', 'scheduled', 'delete_all'])('blocks the %s status', async (status) => {
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData(status))
    expect(result.error).toBeTruthy()
    expect(mockRecordLessonOutcome).not.toHaveBeenCalled()
  })

  it('blocks update on a cancelled lesson', async () => {
    mockGetLessonById.mockResolvedValue({ ...LESSON_OWN, status: 'cancelled' })
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
    expect(mockRecordLessonOutcome).not.toHaveBeenCalled()
  })

  // --- The outcome goes through the one entry (decision #46) ---

  it.each(['completed', 'no_show'])('records %s through recordLessonOutcome', async (status) => {
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData(status))
    expect(result.error).toBeNull()
    expect(mockRecordLessonOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 'lesson-1',
        organizationId: 'org-1',
        status,
        presentStudentIds: null,
        confirmation: { profileId: 'profile-1', source: 'teacher' },
      })
    )
  })

  it('passes the attendance checkboxes as the present list — an empty list is a real answer', async () => {
    await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed', []))
    expect(mockRecordLessonOutcome).toHaveBeenCalledWith(expect.objectContaining({ presentStudentIds: [] }))
  })

  it('still records on an already-completed lesson, so attendance can be corrected', async () => {
    mockGetLessonById.mockResolvedValue({ ...LESSON_OWN, status: 'completed' })
    await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed', ['student-1']))
    expect(mockRecordLessonOutcome).toHaveBeenCalled()
  })

  it('surfaces the reconciler alert', async () => {
    mockRecordLessonOutcome.mockResolvedValue({
      status: 'completed',
      chargeAlert: { type: 'missing_rate', message: 'validation.noTeacherRate' },
    })
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeNull()
    expect(result.chargeAlert).toBe('validation.noTeacherRate')
  })

  it('reports a failed write as a status error', async () => {
    mockRecordLessonOutcome.mockRejectedValue(new Error('boom'))
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
  })
})
