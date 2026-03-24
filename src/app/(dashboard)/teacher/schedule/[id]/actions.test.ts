import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockGetLessonById,
  mockUpdateLessonStatus,
  mockGetTeacherByProfileId,
  mockCreateLessonCharge,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetLessonById: vi.fn(),
  mockUpdateLessonStatus: vi.fn(),
  mockGetTeacherByProfileId: vi.fn(),
  mockCreateLessonCharge: vi.fn(),
  mockRevalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({ getSession: mockGetSession }))
vi.mock('@/lib/lessons', () => ({
  getLessonById: mockGetLessonById,
  updateLessonStatus: mockUpdateLessonStatus,
}))
vi.mock('@/lib/teachers', () => ({ getTeacherByProfileId: mockGetTeacherByProfileId }))
vi.mock('@/lib/billing/createCharge', () => ({ createLessonCharge: mockCreateLessonCharge }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import { updateTeacherLessonOutcome } from './actions'

const TEACHER_RECORD = { id: 'teacher-1', is_active: true }
const LESSON_OWN = {
  id: 'lesson-1',
  status: 'scheduled',
  teacher: { id: 'teacher-1', full_name: 'מורה א' },
  student: { id: 'student-1', full_name: 'תלמיד א' },
  start_at: '2026-03-24T10:00:00Z',
  end_at: '2026-03-24T11:00:00Z',
  cancel_reason: null,
}
const LESSON_OTHER_TEACHER = { ...LESSON_OWN, teacher: { id: 'teacher-99', full_name: 'מורה אחר' } }

const prevState = { error: null }

function makeFormData(status: string) {
  const fd = new FormData()
  fd.set('status', status)
  return fd
}

describe('updateTeacherLessonOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ userId: 'profile-1', orgId: 'org-1', role: 'teacher' })
    mockGetTeacherByProfileId.mockResolvedValue(TEACHER_RECORD)
    mockGetLessonById.mockResolvedValue(LESSON_OWN)
    mockUpdateLessonStatus.mockResolvedValue(undefined)
    mockCreateLessonCharge.mockResolvedValue(null)
  })

  // --- Role guard ---

  it('returns 403 error for non-teacher role (owner)', async () => {
    mockGetSession.mockResolvedValue({ userId: 'profile-1', orgId: 'org-1', role: 'owner' })
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
    expect(mockUpdateLessonStatus).not.toHaveBeenCalled()
  })

  it('returns 403 error for non-teacher role (admin)', async () => {
    mockGetSession.mockResolvedValue({ userId: 'profile-1', orgId: 'org-1', role: 'admin' })
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
    expect(mockUpdateLessonStatus).not.toHaveBeenCalled()
  })

  // --- Teacher isolation (non-negotiable) ---

  it('blocks update when lesson belongs to a different teacher — teacher isolation', async () => {
    mockGetLessonById.mockResolvedValue(LESSON_OTHER_TEACHER)
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
    expect(mockUpdateLessonStatus).not.toHaveBeenCalled()
  })

  it('blocks update when the teacher record is archived', async () => {
    mockGetTeacherByProfileId.mockResolvedValue(null)
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toContain('רשומת מורה פעילה')
    expect(mockUpdateLessonStatus).not.toHaveBeenCalled()
  })

  // --- Write limits (non-negotiable) ---

  it('blocks cancelled status — teacher cannot cancel lessons', async () => {
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('cancelled'))
    expect(result.error).toBeTruthy()
    expect(mockUpdateLessonStatus).not.toHaveBeenCalled()
  })

  it('blocks scheduled status — teacher cannot reset to scheduled', async () => {
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('scheduled'))
    expect(result.error).toBeTruthy()
    expect(mockUpdateLessonStatus).not.toHaveBeenCalled()
  })

  it('blocks arbitrary invalid status values', async () => {
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('delete_all'))
    expect(result.error).toBeTruthy()
    expect(mockUpdateLessonStatus).not.toHaveBeenCalled()
  })

  // --- Cancelled lesson terminal state ---

  it('blocks update on a cancelled lesson', async () => {
    mockGetLessonById.mockResolvedValue({ ...LESSON_OWN, status: 'cancelled' })
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeTruthy()
    expect(mockUpdateLessonStatus).not.toHaveBeenCalled()
  })

  // --- Allowed updates ---

  it('allows marking own lesson as completed', async () => {
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeNull()
    expect(mockUpdateLessonStatus).toHaveBeenCalledWith('lesson-1', 'org-1', 'completed')
  })

  it('allows marking own lesson as no_show', async () => {
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('no_show'))
    expect(result.error).toBeNull()
    expect(mockUpdateLessonStatus).toHaveBeenCalledWith('lesson-1', 'org-1', 'no_show')
  })

  // --- Charge continuity (non-negotiable) ---

  it('calls createLessonCharge when teacher marks lesson completed', async () => {
    await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(mockCreateLessonCharge).toHaveBeenCalledWith('lesson-1', 'org-1')
  })

  it('does NOT call createLessonCharge when teacher marks no_show', async () => {
    await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('no_show'))
    expect(mockCreateLessonCharge).not.toHaveBeenCalled()
  })

  it('surfaces charge alert when createLessonCharge returns a warning', async () => {
    mockCreateLessonCharge.mockResolvedValue({ message: 'אין תעריף שעתי' })
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeNull()
    expect(result.chargeAlert).toBe('אין תעריף שעתי')
  })

  // --- Idempotency ---

  it('returns success without calling updateLessonStatus when status is already the same', async () => {
    mockGetLessonById.mockResolvedValue({ ...LESSON_OWN, status: 'completed' })
    const result = await updateTeacherLessonOutcome('lesson-1', prevState, makeFormData('completed'))
    expect(result.error).toBeNull()
    expect(mockUpdateLessonStatus).not.toHaveBeenCalled()
  })
})
