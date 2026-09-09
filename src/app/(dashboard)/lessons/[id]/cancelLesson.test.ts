import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Authorization around `cancelLesson` and `setLessonStatus`.
 *
 * The billing rule moved into `cancelLessonCore`, so what this file guards is
 * the action's own job: who may cancel, who may waive, and that the status
 * dropdown reaches the same rule as the cancel panel rather than quietly
 * flipping a status and charging nothing.
 *
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
  mockCancelLessonCore,
  mockCommonError,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockGetTeacherByProfileId: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCancelLessonCore: vi.fn(),
  mockCommonError: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
  SUPPORT_MODE_READ_ONLY: 'SUPPORT_MODE_READ_ONLY',
}))
vi.mock('@/lib/teachers', () => ({ getTeacherByProfileId: mockGetTeacherByProfileId }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: mockCreateServiceRoleClient }))
vi.mock('@/lib/cancellation-flow/cancelLessonCore', () => ({
  cancelLessonCore: mockCancelLessonCore,
}))
vi.mock('@/lib/billing/createCharge', () => ({ createLessonCharge: vi.fn() }))
vi.mock('@/lib/i18n/actionErrors', () => ({ commonError: mockCommonError, zodError: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => (k: string) => k) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/server/afterResponse', () => ({ runAfterResponse: vi.fn() }))
vi.mock('@/lib/lessons', () => ({ updateLessonStatus: vi.fn() }))
vi.mock('@/lib/lessons/notes', () => ({ createNote: vi.fn(), deleteNote: vi.fn() }))
vi.mock('@/lib/lessons/cancelSeries', () => ({ stopLessonSeries: vi.fn() }))
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

import { cancelLesson, setLessonStatus } from './actions'

const CORE_OK = {
  success: true,
  billingMode: 'per_lesson',
  lessonId: 'lesson-1',
  lessonStartAt: '2026-09-01T10:00:00Z',
  lessonEndAt: '2026-09-01T11:00:00Z',
  studentName: 'דנה',
  teacherName: 'שרה',
  lines: [],
  billedTotal: 0,
  pendingTotal: 0,
  chargeResult: { shouldCharge: false, chargeType: null, amount: 0, reasonCode: 'no_charge' },
  alerts: [],
}

/** Only the teacher_id lookup for the cancellation notification. */
function stubDb() {
  return {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain)
      chain.maybeSingle = vi.fn(async () => ({ data: { teacher_id: 'teacher-1' }, error: null }))
      chain.single = chain.maybeSingle
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
    mockCreateServiceRoleClient.mockReturnValue(stubDb())
    mockCancelLessonCore.mockResolvedValue(CORE_OK)
    mockGetTeacherByProfileId.mockResolvedValue({ id: 'teacher-1' })
  })

  it('refuses while a superadmin is in read-only support mode', async () => {
    mockRequireMutation.mockImplementation(() => { throw new Error('SUPPORT_MODE_READ_ONLY') })
    const res = await cancelLesson('lesson-1', { error: null }, formData())
    expect(res.error).toBe('common.supportModeReadOnly')
    // It must bail before cancelling anything.
    expect(mockCancelLessonCore).not.toHaveBeenCalled()
  })

  it('requires a reason', async () => {
    const fd = new FormData()
    fd.set('cancel_reason', '   ')
    const res = await cancelLesson('lesson-1', { error: null }, fd)
    expect(res.error).toBe('lessons.errors.reasonRequired')
    expect(mockCancelLessonCore).not.toHaveBeenCalled()
  })

  it('lets a teacher cancel her own lesson', async () => {
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'teacher', isSupportMode: false })
    mockGetTeacherByProfileId.mockResolvedValue({ id: 'teacher-1' })
    const res = await cancelLesson('lesson-1', { error: null }, formData())
    expect(res.error).toBeNull()
    expect(mockCancelLessonCore.mock.calls[0][0]).toMatchObject({
      actor: { kind: 'teacher', teacherId: 'teacher-1' },
      source: 'teacher',
    })
  })

  it("refuses a teacher on another teacher's lesson", async () => {
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'teacher', isSupportMode: false })
    mockGetTeacherByProfileId.mockResolvedValue({ id: 'teacher-99' })
    // Ownership is the core's call now; it sees the lesson row.
    mockCancelLessonCore.mockResolvedValue({ success: false, error: 'forbidden' })
    const res = await cancelLesson('lesson-1', { error: null }, formData())
    expect(mockCancelLessonCore.mock.calls[0][0].actor).toEqual({ kind: 'teacher', teacherId: 'teacher-99' })
    expect(res.error).toBe('lessons.errors.noCancelPermission')
  })

  it('refuses a teacher with no active teacher record', async () => {
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'teacher', isSupportMode: false })
    mockGetTeacherByProfileId.mockResolvedValue(null)
    const res = await cancelLesson('lesson-1', { error: null }, formData())
    expect(res.error).toBe('lessons.errors.noCancelPermission')
    expect(mockCancelLessonCore).not.toHaveBeenCalled()
  })

  it('ignores waive=true from a teacher, so the policy still runs', async () => {
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'teacher', isSupportMode: false })
    await cancelLesson('lesson-1', { error: null }, formData({ waive: 'true' }))
    expect(mockCancelLessonCore.mock.calls[0][0].waive).toBe(false)
  })

  it('honours waive=true from an owner', async () => {
    await cancelLesson('lesson-1', { error: null }, formData({ waive: 'true' }))
    expect(mockCancelLessonCore.mock.calls[0][0].waive).toBe(true)
  })

  it('refuses to cancel a lesson that already took place', async () => {
    mockCancelLessonCore.mockResolvedValue({ success: false, error: 'already_delivered' })
    const res = await cancelLesson('lesson-1', { error: null }, formData())
    expect(res.error).toBe('lessons.errors.alreadyDelivered')
  })
})

describe('setLessonStatus — cancelling from the dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireMutation.mockImplementation(() => {})
    mockCommonError.mockImplementation(async (k: string) => `common.${k}`)
    mockGetSession.mockResolvedValue({ userId: 'p-1', orgId: 'org-1', role: 'owner', isSupportMode: false })
    mockCreateServiceRoleClient.mockReturnValue(stubDb())
    mockCancelLessonCore.mockResolvedValue(CORE_OK)
  })

  it('runs the cancellation rule instead of just flipping the status', async () => {
    const fd = new FormData()
    fd.set('status', 'cancelled')
    fd.set('cancel_reason', 'מחלה')

    const res = await setLessonStatus('lesson-1', { error: null }, fd)

    expect(res.error).toBeNull()
    // The dropdown used to charge nothing in either billing mode.
    expect(mockCancelLessonCore).toHaveBeenCalledTimes(1)
    expect(mockCancelLessonCore.mock.calls[0][0]).toMatchObject({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: { kind: 'staff' },
      reason: 'מחלה',
    })
  })

  it('surfaces the same refusal the cancel panel gives for a delivered lesson', async () => {
    mockCancelLessonCore.mockResolvedValue({ success: false, error: 'already_delivered' })
    const fd = new FormData()
    fd.set('status', 'cancelled')
    const res = await setLessonStatus('lesson-1', { error: null }, fd)
    expect(res.error).toBe('lessons.errors.alreadyDelivered')
  })
})
