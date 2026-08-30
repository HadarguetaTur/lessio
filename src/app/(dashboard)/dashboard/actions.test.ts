import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockRequireMutation,
  mockRevalidatePath,
  mockMarkAssignmentDone,
  mockSetLessonStatus,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockMarkAssignmentDone: vi.fn(),
  mockSetLessonStatus: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: vi.fn(async (key: string) => key),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/homework', () => ({
  markAssignmentDone: mockMarkAssignmentDone,
}))

vi.mock('@/app/(dashboard)/lessons/[id]/actions', () => ({
  setLessonStatus: mockSetLessonStatus,
}))

import { completeLessonFromDashboard, markHomeworkDoneFromDashboard } from './actions'

describe('completeLessonFromDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates to setLessonStatus with status=completed', async () => {
    mockSetLessonStatus.mockResolvedValue({ error: null })

    const result = await completeLessonFromDashboard('lesson-1')

    expect(result).toEqual({ error: null })
    expect(mockSetLessonStatus).toHaveBeenCalledTimes(1)
    const [lessonId, prevState, formData] = mockSetLessonStatus.mock.calls[0]
    expect(lessonId).toBe('lesson-1')
    expect(prevState).toEqual({ error: null })
    expect(formData).toBeInstanceOf(FormData)
    expect(formData.get('status')).toBe('completed')
  })

  it('passes through error and chargeAlert from setLessonStatus', async () => {
    mockSetLessonStatus.mockResolvedValue({ error: null, chargeAlert: 'no price' })

    const result = await completeLessonFromDashboard('lesson-2')

    expect(result).toEqual({ error: null, chargeAlert: 'no price' })
  })
})

describe('markHomeworkDoneFromDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner' })
  })

  it('returns supportModeReadOnly when requireMutation throws', async () => {
    mockRequireMutation.mockImplementationOnce(() => {
      throw new Error('read only')
    })

    const result = await markHomeworkDoneFromDashboard('hw-1')

    expect(result).toEqual({ error: 'supportModeReadOnly' })
    expect(mockMarkAssignmentDone).not.toHaveBeenCalled()
  })

  it('rejects teachers', async () => {
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'teacher' })

    const result = await markHomeworkDoneFromDashboard('hw-1')

    expect(result).toEqual({ error: 'noPermission' })
    expect(mockMarkAssignmentDone).not.toHaveBeenCalled()
  })

  it('marks the assignment done with the session org and revalidates', async () => {
    mockMarkAssignmentDone.mockResolvedValue({})

    const result = await markHomeworkDoneFromDashboard('hw-1')

    expect(result).toEqual({ error: null })
    expect(mockMarkAssignmentDone).toHaveBeenCalledWith({
      assignmentId: 'hw-1',
      organizationId: 'org-1',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/homework')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/homework/hw-1')
  })

  it('returns a translated error when the lib call throws', async () => {
    mockMarkAssignmentDone.mockRejectedValue(new Error('boom'))

    const result = await markHomeworkDoneFromDashboard('hw-1')

    expect(result).toEqual({ error: 'attention.markDoneFailed' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
