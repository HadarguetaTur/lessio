/**
 * Authorization regression tests for the progress-report actions.
 *
 * These handle a minor's attendance, homework and lesson notes. Both checked
 * org membership only — while every exam action in the same file already calls
 * canAccessStudent — and the email one accepted any well-formed address from
 * the caller, which made it a way to mail a child's record to an inbox of the
 * attacker's choosing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockRequireMutation,
  mockCanAccessStudent,
  mockCreateServiceRoleClient,
  mockGenerateAndStore,
  mockSendEmail,
  mockShouldSendEmail,
  mockBuildData,
  mockRenderPdf,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockCanAccessStudent: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGenerateAndStore: vi.fn(),
  mockSendEmail: vi.fn(),
  mockShouldSendEmail: vi.fn(),
  mockBuildData: vi.fn(),
  mockRenderPdf: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))
vi.mock('@/lib/auth/studentAccess', () => ({ canAccessStudent: mockCanAccessStudent }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/students/generateProgressReportPdf', () => ({
  generateAndStoreProgressReport: mockGenerateAndStore,
  renderProgressReportPdfBufferFromData: mockRenderPdf,
}))
vi.mock('@/lib/students/progressReport', () => ({ buildProgressReportData: mockBuildData }))
vi.mock('@/lib/email', () => ({ sendEmail: mockSendEmail, shouldSendEmail: mockShouldSendEmail }))
vi.mock('@/lib/email/templates/progressReport', () => ({
  progressReportEmail: () => ({ subject: 's', html: 'h' }),
}))
vi.mock('@/lib/organizations', () => ({ getOrgTimezone: vi.fn().mockResolvedValue('Asia/Jerusalem') }))
vi.mock('@/lib/goals', () => ({ createGoal: vi.fn(), updateGoal: vi.fn(), deleteGoal: vi.fn() }))
vi.mock('@/lib/students/exams', async () => {
  const { z } = await import('zod')
  // Real Zod objects: the module under test calls ExamUpdateSchema.extend()
  // at import time, so a bare stub cannot stand in here.
  const fields = { studentId: z.string().uuid(), subject: z.string().min(1) }
  return {
    createExam: vi.fn(), updateExam: vi.fn(), deleteExam: vi.fn(), getExam: vi.fn(),
    ExamCreateSchema: z.object(fields),
    ExamUpdateSchema: z.object(fields),
  }
})
vi.mock('@/lib/exams/policy', () => ({
  examWeekStart: vi.fn(), getExamPolicy: vi.fn(), upsertQuotaOverride: vi.fn(),
}))
vi.mock('@/lib/notifications', () => ({
  notifyMultiple: vi.fn(), getOwnerAndAdminProfileIds: vi.fn().mockResolvedValue([]),
  getTeacherProfileId: vi.fn(),
}))
vi.mock('@/lib/i18n/serverTranslator', () => ({ getT: vi.fn().mockResolvedValue((k: string) => k) }))
vi.mock('@/lib/i18n/locale', () => ({ parseAppLocale: () => 'he' }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}))
vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: vi.fn().mockResolvedValue('noPermission'),
  zodError: vi.fn().mockResolvedValue('invalidData'),
}))

import { generateProgressReportAction, sendProgressReportEmailAction } from './actions'

const TEACHER = {
  orgId: 'org-a', role: 'teacher', profileId: 'p-teacher', userId: 'p-teacher', fullName: 'T',
}

/** relationships → parents(email) for the student under test. */
function mockParentEmails(emails: (string | null)[], error: unknown = null) {
  const eqOrg = vi.fn().mockResolvedValue({
    data: emails.map((email) => ({ parents: { email } })),
    error,
  })
  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: eqOrg }) }),
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(TEACHER)
  mockRequireMutation.mockReturnValue(undefined)
  mockCanAccessStudent.mockResolvedValue(true)
  mockGenerateAndStore.mockResolvedValue({ signedUrl: 'https://signed/report.pdf' })
  mockShouldSendEmail.mockResolvedValue(true)
  mockSendEmail.mockResolvedValue(true)
  mockRenderPdf.mockResolvedValue(Buffer.from('pdf'))
  mockBuildData.mockResolvedValue({
    student: { name: 'Child' },
    org: { name: 'Org' },
    period: { labelFrom: 'a', labelTo: 'b' },
    attendance: { completed: 1, total: 2, ratePercent: 50 },
    homework: { completed: 1, total: 2, avgScore: 80 },
  })
  mockParentEmails(['parent@example.com'])
})

describe('generateProgressReportAction', () => {
  it("refuses a student outside the caller's roster", async () => {
    mockCanAccessStudent.mockResolvedValue(false)

    const result = await generateProgressReportAction('other-teachers-student', '2026-01-01', '2026-01-31')

    expect(result).toEqual({ error: 'noPermission' })
    expect(mockGenerateAndStore).not.toHaveBeenCalled()
  })

  it('mints the signed URL for a student the caller may access', async () => {
    const result = await generateProgressReportAction('own-student', '2026-01-01', '2026-01-31')
    expect(result).toEqual({ error: null, signedUrl: 'https://signed/report.pdf' })
  })
})

describe('sendProgressReportEmailAction', () => {
  it("refuses a student outside the caller's roster", async () => {
    mockCanAccessStudent.mockResolvedValue(false)

    const result = await sendProgressReportEmailAction(
      'other-teachers-student', '2026-01-01', '2026-01-31', 'parent@example.com'
    )

    expect(result).toEqual({ error: 'noPermission' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('refuses an address that is not one of this student\'s parents', async () => {
    const result = await sendProgressReportEmailAction(
      'own-student', '2026-01-01', '2026-01-31', 'attacker@evil.example'
    )

    expect(result).toEqual({ error: 'noPermission' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('sends to a genuine parent address', async () => {
    const result = await sendProgressReportEmailAction(
      'own-student', '2026-01-01', '2026-01-31', 'parent@example.com'
    )

    expect(result).toEqual({ error: null, success: true })
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'parent@example.com' })
    )
  })

  it('matches the parent address case-insensitively', async () => {
    const result = await sendProgressReportEmailAction(
      'own-student', '2026-01-01', '2026-01-31', '  Parent@Example.COM '
    )
    expect(result).toEqual({ error: null, success: true })
  })

  it('fails closed when the relationship lookup errors', async () => {
    mockParentEmails([], { message: 'timeout' })

    const result = await sendProgressReportEmailAction(
      'own-student', '2026-01-01', '2026-01-31', 'parent@example.com'
    )

    expect(result).toEqual({ error: 'noPermission' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('does not treat a parent with no email as a wildcard match', async () => {
    mockParentEmails([null])

    const result = await sendProgressReportEmailAction(
      'own-student', '2026-01-01', '2026-01-31', 'parent@example.com'
    )

    expect(result).toEqual({ error: 'noPermission' })
  })
})
