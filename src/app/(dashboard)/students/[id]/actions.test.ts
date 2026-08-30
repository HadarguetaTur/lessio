import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireMutation: vi.fn(),
  canAccessStudent: vi.fn(),
  createExam: vi.fn(),
  updateExam: vi.fn(),
  deleteExam: vi.fn(),
  getExam: vi.fn(),
  getExamPolicy: vi.fn(),
  upsertQuotaOverride: vi.fn(),
  getOrgTimezone: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mocks.getSession,
  requireMutation: mocks.requireMutation,
}))
vi.mock('@/lib/auth/studentAccess', () => ({ canAccessStudent: mocks.canAccessStudent }))
vi.mock('@/lib/students/exams', async () => {
  const { z } = await import('zod')
  const createFields = {
    studentId: z.string().uuid(),
    subject: z.string().min(1),
    title: z.string().min(1),
    examDate: z.string(),
    score: z.coerce.number().int(),
    maxScore: z.coerce.number().int(),
    notes: z.string().optional(),
  }
  return {
    ExamCreateSchema: z.object(createFields),
    ExamUpdateSchema: z.object({
      subject: createFields.subject,
      title: createFields.title,
      examDate: createFields.examDate,
      score: createFields.score,
      maxScore: createFields.maxScore,
      notes: createFields.notes,
    }),
    createExam: mocks.createExam,
    updateExam: mocks.updateExam,
    deleteExam: mocks.deleteExam,
    getExam: mocks.getExam,
  }
})
vi.mock('@/lib/exams/policy', () => ({
  examWeekStart: vi.fn(() => '2026-08-30'),
  getExamPolicy: mocks.getExamPolicy,
  upsertQuotaOverride: mocks.upsertQuotaOverride,
}))
vi.mock('@/lib/organizations', () => ({ getOrgTimezone: mocks.getOrgTimezone }))
vi.mock('@/lib/goals', () => ({ createGoal: vi.fn(), updateGoal: vi.fn(), deleteGoal: vi.fn() }))
vi.mock('@/lib/notifications', () => ({
  notifyMultiple: vi.fn(),
  getOwnerAndAdminProfileIds: vi.fn(),
  getTeacherProfileId: vi.fn(),
}))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: vi.fn() }))
vi.mock('@/lib/students/generateProgressReportPdf', () => ({
  generateAndStoreProgressReport: vi.fn(),
  renderProgressReportPdfBufferFromData: vi.fn(),
}))
vi.mock('@/lib/students/progressReport', () => ({ buildProgressReportData: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), shouldSendEmail: vi.fn() }))
vi.mock('@/lib/email/templates/progressReport', () => ({ progressReportEmail: vi.fn() }))
vi.mock('@/lib/i18n/serverTranslator', () => ({ getT: vi.fn() }))
vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: vi.fn(async (key: string) => `common.${key}`),
  zodError: vi.fn(async () => 'validation.error'),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  approveExamQuotaBumpAction,
  createExamAction,
  deleteExamAction,
  updateExamAction,
} from './actions'

const STUDENT_A = '11111111-1111-4111-8111-111111111111'
const STUDENT_B = '22222222-2222-4222-8222-222222222222'
const EXAM_B = '33333333-3333-4333-8333-333333333333'

const teacherSession = {
  userId: 'profile-a',
  profileId: 'profile-a',
  orgId: 'org-1',
  role: 'teacher',
  fullName: 'Teacher A',
}

function examForm(studentId = STUDENT_B, examId?: string): FormData {
  const form = new FormData()
  form.set('studentId', studentId)
  if (examId) form.set('examId', examId)
  form.set('subject', 'Math')
  form.set('title', 'Algebra')
  form.set('examDate', '2026-09-01')
  form.set('score', '90')
  form.set('maxScore', '100')
  return form
}

const otherTeacherExam = {
  id: EXAM_B,
  studentId: STUDENT_B,
  examDate: '2026-09-01',
}

describe('teacher authorization for exam actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue(teacherSession)
    mocks.getExam.mockResolvedValue(otherTeacherExam)
    mocks.canAccessStudent.mockResolvedValue(false)
  })

  it('blocks creating an exam with another teacher\'s student ID', async () => {
    const result = await createExamAction({ error: null }, examForm())

    expect(result).toEqual({ error: 'common.noPermission' })
    expect(mocks.canAccessStudent).toHaveBeenCalledWith(teacherSession, STUDENT_B)
    expect(mocks.createExam).not.toHaveBeenCalled()
  })

  it('blocks updating another teacher\'s exam ID', async () => {
    const result = await updateExamAction({ error: null }, examForm(STUDENT_B, EXAM_B))

    expect(result).toEqual({ error: 'common.noPermission' })
    expect(mocks.canAccessStudent).toHaveBeenCalledWith(teacherSession, STUDENT_B)
    expect(mocks.updateExam).not.toHaveBeenCalled()
  })

  it('blocks deleting another teacher\'s exam ID', async () => {
    const result = await deleteExamAction({ error: null }, examForm(STUDENT_B, EXAM_B))

    expect(result).toEqual({ error: 'common.noPermission' })
    expect(mocks.deleteExam).not.toHaveBeenCalled()
  })

  it('blocks approving a quota bump for another teacher\'s exam ID', async () => {
    const result = await approveExamQuotaBumpAction(
      { error: null },
      examForm(STUDENT_B, EXAM_B)
    )

    expect(result).toEqual({ error: 'common.noPermission' })
    expect(mocks.upsertQuotaOverride).not.toHaveBeenCalled()
    expect(mocks.getExamPolicy).not.toHaveBeenCalled()
  })

  it('does not trust a forged submitted student ID for an otherwise valid exam', async () => {
    mocks.canAccessStudent.mockResolvedValue(true)

    const result = await updateExamAction({ error: null }, examForm(STUDENT_A, EXAM_B))

    expect(result).toEqual({ error: 'common.invalidData' })
    expect(mocks.canAccessStudent).not.toHaveBeenCalled()
    expect(mocks.updateExam).not.toHaveBeenCalled()
  })

  it('preserves owner access to an org-scoped exam', async () => {
    const ownerSession = { ...teacherSession, role: 'owner' }
    mocks.getSession.mockResolvedValue(ownerSession)
    mocks.canAccessStudent.mockResolvedValue(true)
    mocks.updateExam.mockResolvedValue(otherTeacherExam)

    const result = await updateExamAction({ error: null }, examForm(STUDENT_B, EXAM_B))

    expect(result).toEqual({ error: null, success: true })
    expect(mocks.updateExam).toHaveBeenCalledOnce()
  })
})
