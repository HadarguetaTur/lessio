/**
 * Authorization regression tests for the student card's lazy-tab actions.
 *
 * Each of these resolves orgId from the session and then hands a
 * client-supplied studentId to a service-role query. Role was never consulted
 * and the student was never bound to the caller, so a teacher could read any
 * student in the org — including the billing and parent-contact data the
 * product's own docs say teachers cannot see. The financial tab is merely
 * hidden from the teacher tab bar, and a hidden tab is not authorization: a
 * server action is a live endpoint whatever the UI renders.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockCanAccessStudent,
  mockGetStudentFinancial,
  mockGetStudentPrimaryParent,
  mockGetStudentLessons,
  mockGetAssignments,
  mockGetSubscriptions,
  mockGetGoalsForStudent,
  mockListExams,
  mockCreateServiceRoleClient,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCanAccessStudent: vi.fn(),
  mockGetStudentFinancial: vi.fn(),
  mockGetStudentPrimaryParent: vi.fn(),
  mockGetStudentLessons: vi.fn(),
  mockGetAssignments: vi.fn(),
  mockGetSubscriptions: vi.fn(),
  mockGetGoalsForStudent: vi.fn(),
  mockListExams: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: vi.fn(),
}))
vi.mock('@/lib/auth/studentAccess', () => ({ canAccessStudent: mockCanAccessStudent }))
vi.mock('@/lib/students', () => ({
  getStudentFinancial: mockGetStudentFinancial,
  getStudentPrimaryParent: mockGetStudentPrimaryParent,
  getStudentLessons: mockGetStudentLessons,
}))
vi.mock('@/lib/homework', () => ({ getAssignments: mockGetAssignments }))
vi.mock('@/lib/subscriptions', () => ({ getSubscriptions: mockGetSubscriptions }))
vi.mock('@/lib/goals', () => ({ getGoalsForStudent: mockGetGoalsForStudent }))
vi.mock('@/lib/students/exams', () => ({ listExams: mockListExams }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/teachers', () => ({ getTeacherByProfileId: vi.fn() }))
vi.mock('@/lib/phone', () => ({
  normalizePhone: (p: string) => p,
  PhoneNormalizationError: class extends Error {},
}))
vi.mock('@/lib/saas/quota', () => ({ requireQuotaCapacity: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}))
vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: vi.fn().mockResolvedValue('noPermission'),
  zodError: vi.fn().mockResolvedValue('invalidData'),
}))

import {
  fetchStudentExams,
  fetchStudentFinancial,
  fetchStudentGoals,
  fetchStudentHomework,
  fetchStudentLessons,
  fetchStudentParent,
  fetchStudentParentEmails,
  fetchStudentSubscriptions,
} from './actions'

const OWNER = { orgId: 'org-a', role: 'owner', profileId: 'p-owner', userId: 'p-owner', fullName: 'O' }
const TEACHER = { ...OWNER, role: 'teacher', profileId: 'p-teacher' }

/** Every lazy-tab action, so a newly added one cannot quietly skip the check. */
const ALL = [
  ['fetchStudentParent', fetchStudentParent],
  ['fetchStudentLessons', fetchStudentLessons],
  ['fetchStudentFinancial', fetchStudentFinancial],
  ['fetchStudentHomework', fetchStudentHomework],
  ['fetchStudentSubscriptions', fetchStudentSubscriptions],
  ['fetchStudentGoals', fetchStudentGoals],
  ['fetchStudentExams', fetchStudentExams],
  ['fetchStudentParentEmails', fetchStudentParentEmails],
] as const

/** The ones the permissions matrix keeps away from teachers entirely. */
const BILLING_AND_CONTACT = [
  ['fetchStudentFinancial', fetchStudentFinancial],
  ['fetchStudentSubscriptions', fetchStudentSubscriptions],
  ['fetchStudentParentEmails', fetchStudentParentEmails],
] as const

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(OWNER)
  mockCanAccessStudent.mockResolvedValue(true)
  mockGetStudentFinancial.mockResolvedValue({ recent_charges: [] })
  mockGetStudentPrimaryParent.mockResolvedValue(null)
  mockGetStudentLessons.mockResolvedValue([])
  mockGetAssignments.mockResolvedValue([])
  mockGetSubscriptions.mockResolvedValue([])
  mockGetGoalsForStudent.mockResolvedValue([])
  mockListExams.mockResolvedValue([])
  const eqOrg = vi.fn().mockResolvedValue({ data: [] })
  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: eqOrg }) }),
    }),
  })
})

describe('student ownership is checked, not assumed', () => {
  it.each(ALL)('%s refuses a student the caller cannot access', async (_name, fn) => {
    mockCanAccessStudent.mockResolvedValue(false)

    const result = await fn('student-of-another-teacher')

    expect(result).toEqual({ error: 'noPermission' })
    expect(mockCanAccessStudent).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-a' }),
      'student-of-another-teacher'
    )
  })

  it.each(ALL)('%s loads data when access is genuine', async (_name, fn) => {
    const result = await fn('student-a')
    expect(result).not.toHaveProperty('error')
  })

  it('does not reach the data layer at all when access is refused', async () => {
    mockCanAccessStudent.mockResolvedValue(false)
    await fetchStudentFinancial('someone-elses-student')
    expect(mockGetStudentFinancial).not.toHaveBeenCalled()
  })
})

describe('teachers cannot reach billing or parent contact data', () => {
  it.each(BILLING_AND_CONTACT)('%s refuses a teacher outright', async (_name, fn) => {
    mockGetSession.mockResolvedValue(TEACHER)
    // Even for a student that IS on the teacher's own roster.
    mockCanAccessStudent.mockResolvedValue(true)

    const result = await fn('own-student')

    expect(result).toEqual({ error: 'noPermission' })
    expect(mockGetStudentFinancial).not.toHaveBeenCalled()
    expect(mockGetSubscriptions).not.toHaveBeenCalled()
  })

  it.each([
    ['fetchStudentLessons', fetchStudentLessons],
    ['fetchStudentHomework', fetchStudentHomework],
    ['fetchStudentGoals', fetchStudentGoals],
    ['fetchStudentExams', fetchStudentExams],
  ] as const)('%s stays available to a teacher for their own student', async (_name, fn) => {
    mockGetSession.mockResolvedValue(TEACHER)
    const result = await fn('own-student')
    expect(result).not.toHaveProperty('error')
  })
})
