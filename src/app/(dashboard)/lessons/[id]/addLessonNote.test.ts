/**
 * A teacher may write notes on their own lessons. Nothing checked that the
 * lessonId they posted was one of theirs, so a note — including one flagged
 * visibleToParent, which surfaces in that family's portal — could be filed
 * against any colleague's lesson in the org.
 *
 * deleteLessonNote in the same file already scoped deletes to the acting
 * teacher, which is what makes this an oversight rather than a design.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockRequireMutation,
  mockGetTeacherByProfileId,
  mockCreateNote,
  mockDeleteNote,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockGetTeacherByProfileId: vi.fn(),
  mockCreateNote: vi.fn(),
  mockDeleteNote: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))
vi.mock('@/lib/teachers', () => ({ getTeacherByProfileId: mockGetTeacherByProfileId }))
vi.mock('@/lib/lessons/notes', () => ({ createNote: mockCreateNote, deleteNote: mockDeleteNote }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
  getLocale: vi.fn().mockResolvedValue('he'),
}))
vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: vi.fn().mockResolvedValue('noPermission'),
  zodError: vi.fn().mockResolvedValue('invalidData'),
}))

import { addLessonNote } from './actions'

/** `owns` decides what the teacher-ownership probe on `lessons` finds. */
function mockLessonProbe(owns: boolean) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: owns ? { id: 'lesson-1' } : null,
    error: null,
  })
  const eq3 = vi.fn().mockReturnValue({ maybeSingle })
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const single = vi.fn().mockResolvedValue({ data: { teacher_id: 'teacher-x' }, error: null })
  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: eq1,
        // owner/admin branch resolves the lesson's own teacher with .single()
        single,
      }),
    }),
  })
  // The owner/admin branch chains .eq().eq().single()
  eq2.mockReturnValue({ eq: eq3, single })
  eq1.mockReturnValue({ eq: eq2, single })
}

function noteForm(visibleToParent = 'true'): FormData {
  const fd = new FormData()
  fd.set('body', 'A note the parent will read')
  fd.set('visibleToParent', visibleToParent)
  return fd
}

const TEACHER = {
  orgId: 'org-a', role: 'teacher', profileId: 'p-teacher', userId: 'p-teacher', fullName: 'T',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(TEACHER)
  mockRequireMutation.mockReturnValue(undefined)
  mockGetTeacherByProfileId.mockResolvedValue({ id: 'teacher-1' })
  mockCreateNote.mockResolvedValue({ id: 'n1' })
})

describe('addLessonNote', () => {
  it('refuses a teacher writing on a lesson that is not theirs', async () => {
    mockLessonProbe(false)

    const result = await addLessonNote('someone-elses-lesson', { error: null }, noteForm())

    expect(result).toEqual({ error: 'noPermission' })
    expect(mockCreateNote).not.toHaveBeenCalled()
  })

  it('does not let a parent-visible note reach an unrelated family', async () => {
    mockLessonProbe(false)

    await addLessonNote('someone-elses-lesson', { error: null }, noteForm('true'))

    expect(mockCreateNote).not.toHaveBeenCalled()
  })

  it('lets a teacher write on their own lesson', async () => {
    mockLessonProbe(true)

    const result = await addLessonNote('lesson-1', { error: null }, noteForm())

    expect(result).toEqual({ error: null, success: true })
    expect(mockCreateNote).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-a', lessonId: 'lesson-1', teacherId: 'teacher-1' })
    )
  })

  it('still refuses when the session cannot mutate (support mode / lapsed org)', async () => {
    mockLessonProbe(true)
    mockRequireMutation.mockImplementation(() => {
      throw new Error('SUPPORT_MODE_READ_ONLY')
    })

    const result = await addLessonNote('lesson-1', { error: null }, noteForm())

    expect(result).toEqual({ error: 'noPermission' })
    expect(mockCreateNote).not.toHaveBeenCalled()
  })
})
