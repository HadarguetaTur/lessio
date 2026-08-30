import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient, mockGetTeacherByProfileId } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockGetTeacherByProfileId: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/teachers', () => ({ getTeacherByProfileId: mockGetTeacherByProfileId }))

import { canAccessStudent } from './studentAccess'

const baseSession = {
  orgId: 'org-1',
  profileId: 'profile-teacher-a',
  role: 'teacher',
}

function mockStudentResult(data: { teacher_id: string | null } | null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error })
  const eqOrg = vi.fn().mockReturnValue({ maybeSingle })
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg })
  const select = vi.fn().mockReturnValue({ eq: eqId })
  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn().mockReturnValue({ select }),
  })
}

describe('canAccessStudent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a teacher assigned to the student', async () => {
    mockStudentResult({ teacher_id: 'teacher-a' })
    mockGetTeacherByProfileId.mockResolvedValue({ id: 'teacher-a' })

    await expect(canAccessStudent(baseSession, 'student-a')).resolves.toBe(true)
    expect(mockGetTeacherByProfileId).toHaveBeenCalledWith(
      'profile-teacher-a',
      'org-1',
      { activeOnly: true }
    )
  })

  it('rejects a forged student ID assigned to another teacher in the same organization', async () => {
    mockStudentResult({ teacher_id: 'teacher-b' })
    mockGetTeacherByProfileId.mockResolvedValue({ id: 'teacher-a' })

    await expect(canAccessStudent(baseSession, 'student-b')).resolves.toBe(false)
  })

  it('rejects students outside the organization', async () => {
    mockStudentResult(null)

    await expect(canAccessStudent(baseSession, 'student-other-org')).resolves.toBe(false)
    expect(mockGetTeacherByProfileId).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin'])('allows an %s to access an org-scoped student', async (role) => {
    mockStudentResult({ teacher_id: 'teacher-b' })

    await expect(canAccessStudent({ ...baseSession, role }, 'student-b')).resolves.toBe(true)
    expect(mockGetTeacherByProfileId).not.toHaveBeenCalled()
  })
})
