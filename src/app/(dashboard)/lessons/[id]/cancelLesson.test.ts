import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Authorization around `cancelLesson`.
 *
 * Two things are covered that nothing covered before:
 *   1. Support mode is read-only. Cancelling bills a parent, so a superadmin
 *      impersonating an org must not be able to do it.
 *   2. A teacher may cancel her own lesson and only her own — and may not
 *      waive the fee, which is the owner's decision.
 */

const {
  mockGetSession,
  mockRequireMutation,
  mockGetTeacherByProfileId,
  mockCreateServiceRoleClient,
  mockGetCancellationPolicy,
  mockCalculateCancellationCharge,
  mockCreateCancellationCharge,
  mockResolveBillingParent,
  mockGetOrgPricing,
  mockCommonError,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockGetTeacherByProfileId: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockGetCancellationPolicy: vi.fn(),
  mockCalculateCancellationCharge: vi.fn(),
  mockCreateCancellationCharge: vi.fn(),
  mockResolveBillingParent: vi.fn(),
  mockGetOrgPricing: vi.fn(),
  mockCommonError: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
  SUPPORT_MODE_READ_ONLY: 'SUPPORT_MODE_READ_ONLY',
}))
vi.mock('@/lib/teachers', () => ({ getTeacherByProfileId: mockGetTeacherByProfileId }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: mockCreateServiceRoleClient }))
vi.mock('@/lib/cancellation-policy', () => ({ getCancellationPolicy: mockGetCancellationPolicy }))
vi.mock('@/lib/billing/calculateCancellationCharge', () => ({
  calculateCancellationCharge: mockCalculateCancellationCharge,
}))
vi.mock('@/lib/billing/createCharge', () => ({
  createCancellationCharge: mockCreateCancellationCharge,
  createLessonCharge: vi.fn(),
}))
vi.mock('@/lib/billing/resolveBillingParent', () => ({
  resolveBillingParent: mockResolveBillingParent,
  MissingPrimaryParentError: class MissingPrimaryParentError extends Error {},
}))
vi.mock('@/lib/organizations/pricing', () => ({ getOrgPricing: mockGetOrgPricing }))
vi.mock('@/lib/billing/lessonPricing', () => ({
  resolveLessonBaseAmount: vi.fn(() => 100),
  isMissingPrice: vi.fn(() => false),
  toStudentPricing: vi.fn((row) => ({
    hourlyRate: row?.hourly_rate ?? null,
    discountPercent: row?.discount_percent ?? null,
  })),
}))
vi.mock('@/lib/i18n/actionErrors', () => ({ commonError: mockCommonError, zodError: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (k: string) => k) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/server/afterResponse', () => ({ runAfterResponse: vi.fn() }))
vi.mock('@/lib/lessons', () => ({ updateLessonStatus: vi.fn() }))
vi.mock('@/lib/lessons/notes', () => ({ createNote: vi.fn(), deleteNote: vi.fn() }))
vi.mock('@/lib/lessons/cancelSeries', () => ({ cancelLessonSeries: vi.fn() }))
vi.mock('@/lib/billing/monthly/cancellationEvents', () => ({ createCancellationEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications', () => ({
  notifyMultiple: vi.fn(async () => {}),
  getOwnerAndAdminProfileIds: vi.fn(async () => []),
  getTeacherProfileId: vi.fn(async () => null),
}))
vi.mock('@/lib/payment-request/autoSend', () => ({ autoSendPaymentRequest: vi.fn() }))
vi.mock('@/lib/crypto', () => ({ decryptToken: vi.fn() }))
vi.mock('@/lib/whatsapp/strings', () => ({ botString: vi.fn(() => '') }))
vi.mock('@/lib/whatsapp/sendSmart', () => ({ sendSmartMessage: vi.fn() }))
vi.mock('@/lib/i18n/locale', () => ({
  resolveRecipientLocale: vi.fn(() => 'he'),
  toLuxonLocale: vi.fn(() => 'he'),
}))
vi.mock('@/lib/organizations', () => ({ getOrgTimezone: vi.fn(async () => 'Asia/Jerusalem') }))

import { cancelLesson } from './actions'

const LESSON = {
  id: 'lesson-1',
  start_at: '2026-09-01T10:00:00Z',
  end_at: '2026-09-01T11:00:00Z',
  status: 'scheduled',
  lesson_type: 'individual',
  price_per_student: 100,
  lesson_students: [{ student_id: 'student-1' }],
  teachers: { id: 'teacher-1', hourly_rate: 200 },
}

/**
 * Chain-agnostic supabase stub. The action uses several different builder
 * shapes (`.eq().eq().single()` for the lesson, `.eq().single()` for the org
 * timezone), so every method returns the same chainable object and the
 * terminals resolve per table.
 */
function stubDb(lesson: unknown) {
  const rowFor = (table: string) =>
    table === 'lessons' ? lesson : { timezone: 'Asia/Jerusalem' }

  return {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {}
      const link = () => chain
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'update', 'insert', 'neq', 'gte', 'lte']) {
        chain[m] = vi.fn(link)
      }
      chain.single = vi.fn(async () => ({ data: rowFor(table), error: null }))
      chain.maybeSingle = chain.single
      // `await db.from(...).update(...).eq(...).eq(...)` — the chain itself is awaited.
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
      return chain
    }),
  }
}

function formData(fields: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set('cancel_reason', 'מחלה')
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('cancelLesson — authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireMutation.mockImplementation(() => {})
    mockCommonError.mockImplementation(async (k: string) => `common.${k}`)
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'owner', isSupportMode: false })
    mockCreateServiceRoleClient.mockReturnValue(stubDb(LESSON))
    mockGetCancellationPolicy.mockResolvedValue(null)
    mockGetOrgPricing.mockResolvedValue({})
    mockCalculateCancellationCharge.mockReturnValue({ shouldCharge: false, amount: 0, reasonCode: null })
    mockResolveBillingParent.mockResolvedValue('parent-1')
    mockGetTeacherByProfileId.mockResolvedValue({ id: 'teacher-1' })
  })

  it('refuses while a superadmin is in read-only support mode', async () => {
    mockRequireMutation.mockImplementation(() => { throw new Error('SUPPORT_MODE_READ_ONLY') })
    const res = await cancelLesson('lesson-1', { error: null }, formData())
    expect(res.error).toBe('common.supportModeReadOnly')
    // It must bail before reading, let alone writing, the lesson.
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })

  it('requires a reason', async () => {
    const fd = new FormData()
    fd.set('cancel_reason', '   ')
    const res = await cancelLesson('lesson-1', { error: null }, fd)
    expect(res.error).toBe('lessons.errors.reasonRequired')
  })

  it('lets a teacher cancel her own lesson', async () => {
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'teacher', isSupportMode: false })
    mockGetTeacherByProfileId.mockResolvedValue({ id: 'teacher-1' })
    const res = await cancelLesson('lesson-1', { error: null }, formData())
    expect(res.error).toBeNull()
  })

  it("refuses a teacher on another teacher's lesson", async () => {
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'teacher', isSupportMode: false })
    mockGetTeacherByProfileId.mockResolvedValue({ id: 'teacher-99' })
    const res = await cancelLesson('lesson-1', { error: null }, formData())
    expect(res.error).toBe('lessons.errors.noCancelPermission')
  })

  it('refuses a teacher with no active teacher record', async () => {
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'teacher', isSupportMode: false })
    mockGetTeacherByProfileId.mockResolvedValue(null)
    const res = await cancelLesson('lesson-1', { error: null }, formData())
    expect(res.error).toBe('lessons.errors.noCancelPermission')
  })

  it('ignores waive=true from a teacher, so the policy still runs', async () => {
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'teacher', isSupportMode: false })
    await cancelLesson('lesson-1', { error: null }, formData({ waive: 'true' }))
    // waive would have skipped the policy read entirely.
    expect(mockGetCancellationPolicy).toHaveBeenCalledWith('org-1')
  })

  it('honours waive=true from an owner', async () => {
    await cancelLesson('lesson-1', { error: null }, formData({ waive: 'true' }))
    expect(mockGetCancellationPolicy).not.toHaveBeenCalled()
  })
})
