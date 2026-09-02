import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetPortalSession,
  mockCreateServiceRoleClient,
  mockRevalidatePath,
  mockCreateExamReport,
  mockNotifyExamReported,
  mockApplyExamPolicy,
  mockRunAfterResponse,
} = vi.hoisted(() => ({
  mockGetPortalSession: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockCreateExamReport: vi.fn(),
  mockNotifyExamReported: vi.fn(() => Promise.resolve()),
  mockApplyExamPolicy: vi.fn(() => Promise.resolve()),
  mockRunAfterResponse: vi.fn(async (work: Promise<unknown>) => { await work }),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))
vi.mock('@/lib/portal/session', () => ({ getPortalSession: mockGetPortalSession }))
vi.mock('@/lib/portal/features', () => ({
  isPortalFeatureEnabled: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/students/exams', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/students/exams')>()
  return { ...actual, createExamReport: mockCreateExamReport }
})
vi.mock('@/lib/exams/notify', () => ({ notifyExamReported: mockNotifyExamReported }))
vi.mock('@/lib/exams/policy', () => ({ applyExamPolicy: mockApplyExamPolicy }))
vi.mock('@/lib/server/afterResponse', () => ({ runAfterResponse: mockRunAfterResponse }))

import { reportExamAction } from './actions'

const ORG = 'org-1'
const STUDENT = '5e9d0a49-0000-4000-8000-000000000001'

/** relationships lookup: `found` controls whether the parent owns the student. */
function relationshipsClient(found: boolean) {
  return {
    from: vi.fn(() => {
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        maybeSingle: async () => ({ data: found ? { id: 'rel-1' } : null, error: null }),
      })
      return b
    }),
  }
}

function makeFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set('studentId', STUDENT)
  fd.set('subject', 'מתמטיקה')
  fd.set('title', 'משוואות ריבועיות')
  fd.set('examDate', '2026-09-15')
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPortalSession.mockResolvedValue({ parentId: 'parent-1', orgId: ORG })
  mockCreateServiceRoleClient.mockReturnValue(relationshipsClient(true))
  mockCreateExamReport.mockResolvedValue({ id: 'exam-1', studentId: STUDENT, subject: 'מתמטיקה' })
})

describe('reportExamAction', () => {
  it('refuses without a portal session', async () => {
    mockGetPortalSession.mockResolvedValue(null)

    const result = await reportExamAction(ORG, { error: null }, makeFormData())

    expect(result.error).toBe('unauthorized')
    expect(mockCreateExamReport).not.toHaveBeenCalled()
  })

  it('refuses a session from another organization', async () => {
    mockGetPortalSession.mockResolvedValue({ parentId: 'parent-1', orgId: 'other-org' })

    const result = await reportExamAction(ORG, { error: null }, makeFormData())

    expect(result.error).toBe('unauthorized')
    expect(mockCreateExamReport).not.toHaveBeenCalled()
  })

  it('refuses a student that is not linked to the parent', async () => {
    mockCreateServiceRoleClient.mockReturnValue(relationshipsClient(false))

    const result = await reportExamAction(ORG, { error: null }, makeFormData())

    expect(result.error).toBe('notAllowedForStudent')
    expect(mockCreateExamReport).not.toHaveBeenCalled()
  })

  it('rejects invalid input before touching the database write', async () => {
    const result = await reportExamAction(ORG, { error: null }, makeFormData({ examDate: '15/09' }))

    expect(result.error).toBe('invalidInput')
    expect(mockCreateExamReport).not.toHaveBeenCalled()
  })

  it('creates the report and registers completion-tracked notification + policy work', async () => {
    const result = await reportExamAction(ORG, { error: null }, makeFormData())

    expect(result).toEqual({ error: null, success: true })
    expect(mockCreateExamReport).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG,
        studentId: STUDENT,
        source: 'parent',
        reportedByParentId: 'parent-1',
      })
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/portal/${ORG}/exams`)
    expect(mockNotifyExamReported).toHaveBeenCalledTimes(1)
    // applyExamPolicy is reached via dynamic import — allow the microtask to run.
    expect(mockApplyExamPolicy).toHaveBeenCalledTimes(1)
    expect(mockRunAfterResponse).toHaveBeenCalledTimes(1)
  })

  it('keeps exam creation successful when notification delivery fails', async () => {
    mockNotifyExamReported.mockRejectedValueOnce(new Error('notification unavailable'))

    const result = await reportExamAction(ORG, { error: null }, makeFormData())

    expect(result).toEqual({ error: null, success: true })
    expect(mockApplyExamPolicy).toHaveBeenCalledTimes(1)
  })
})
