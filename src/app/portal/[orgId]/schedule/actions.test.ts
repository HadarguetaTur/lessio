import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetPortalSession,
  mockExecuteCancellation,
  mockCreateServiceRoleClient,
  mockRevalidatePath,
  mockNotifyMultiple,
} = vi.hoisted(() => ({
  mockGetPortalSession: vi.fn(),
  mockExecuteCancellation: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockNotifyMultiple: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/portal/session', () => ({ getPortalSession: mockGetPortalSession }))
vi.mock('@/lib/cancellation-flow/executeCancellation', () => ({
  executeCancellation: mockExecuteCancellation,
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/notifications', () => ({
  notifyMultiple: mockNotifyMultiple,
  getOwnerAndAdminProfileIds: vi.fn().mockResolvedValue([]),
  getTeacherProfileId: vi.fn().mockResolvedValue(null),
}))
const mockIsPortalFeatureEnabled = vi.hoisted(() => vi.fn())
vi.mock('@/lib/portal/features', () => ({
  isPortalFeatureEnabled: mockIsPortalFeatureEnabled,
}))

import { cancelLessonAction } from './actions'

const ORG = 'org-1'
const LESSON = 'lesson-1'

/** The lesson lookup the action does before notifying staff. */
function lessonClient(teacherId: string | null) {
  return {
    from: vi.fn(() => {
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        eq: vi.fn(() => b),
        single: async () => ({ data: { teacher_id: teacherId }, error: null }),
      })
      return { select: vi.fn(() => b) }
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPortalSession.mockResolvedValue({ parentId: 'parent-1', orgId: ORG })
  mockIsPortalFeatureEnabled.mockResolvedValue(true)
  mockCreateServiceRoleClient.mockReturnValue(lessonClient(null))
  mockExecuteCancellation.mockResolvedValue({
    success: true,
    lessonStartAt: '2026-08-28T13:00:00.000Z',
    studentName: 'נועה לוי',
    teacherName: 'מיכל אברמוב',
    chargeResult: { shouldCharge: true, chargeType: 'partial', amount: 120, reasonCode: 'partial_charge' },
  })
})

describe('cancelLessonAction', () => {
  it('refuses without a portal session, and cancels nothing', async () => {
    mockGetPortalSession.mockResolvedValue(null)

    expect(await cancelLessonAction(ORG, LESSON)).toEqual({ ok: false, error: 'unauthorized' })
    expect(mockExecuteCancellation).not.toHaveBeenCalled()
  })

  // A session for one org must not reach into another's lessons.
  it('refuses when the session belongs to a different organization', async () => {
    mockGetPortalSession.mockResolvedValue({ parentId: 'parent-1', orgId: 'other-org' })

    expect(await cancelLessonAction(ORG, LESSON)).toEqual({ ok: false, error: 'unauthorized' })
    expect(mockExecuteCancellation).not.toHaveBeenCalled()
  })

  // The org switched parent self-cancel off in its portal settings. A dialog
  // that was already open must not get past the toggle.
  it('refuses when the org has portal cancellation switched off', async () => {
    mockIsPortalFeatureEnabled.mockResolvedValue(false)

    expect(await cancelLessonAction(ORG, LESSON)).toEqual({ ok: false, error: 'not_eligible' })
    expect(mockIsPortalFeatureEnabled).toHaveBeenCalledWith(ORG, 'cancellation')
    expect(mockExecuteCancellation).not.toHaveBeenCalled()
  })

  it('records the cancellation as coming from the portal', async () => {
    await cancelLessonAction(ORG, LESSON)

    expect(mockExecuteCancellation).toHaveBeenCalledWith(LESSON, 'parent-1', ORG, 'portal')
  })

  /**
   * Without this the parent is left looking at a schedule that still lists the
   * lesson as scheduled, with a live cancel button on it, while a charge has
   * already appeared on their bill.
   */
  it('revalidates every screen the cancellation changed', async () => {
    await cancelLessonAction(ORG, LESSON)

    const paths = mockRevalidatePath.mock.calls.map(([p]) => p)
    expect(paths).toEqual(
      expect.arrayContaining([
        `/portal/${ORG}/schedule`,
        `/portal/${ORG}/home`,
        `/portal/${ORG}/payments`,
      ])
    )
  })

  it('reports the amount charged so the parent can be told', async () => {
    expect(await cancelLessonAction(ORG, LESSON)).toEqual({ ok: true, charged: true, amount: 120 })
  })

  it('reports no charge when the policy does not ask for one', async () => {
    mockExecuteCancellation.mockResolvedValue({
      success: true,
      lessonStartAt: '2026-08-28T13:00:00.000Z',
      studentName: 'נועה לוי',
      teacherName: 'מיכל אברמוב',
      chargeResult: { shouldCharge: false, chargeType: null, amount: 0, reasonCode: 'outside_window' },
    })

    expect(await cancelLessonAction(ORG, LESSON)).toEqual({ ok: true, charged: false, amount: 0 })
  })

  it('passes a known failure through, and revalidates nothing', async () => {
    mockExecuteCancellation.mockResolvedValue({ success: false, error: 'already_cancelled' })

    expect(await cancelLessonAction(ORG, LESSON)).toEqual({ ok: false, error: 'already_cancelled' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('maps an unrecognised failure to the generic error', async () => {
    mockExecuteCancellation.mockResolvedValue({ success: false, error: 'something_new' })

    expect(await cancelLessonAction(ORG, LESSON)).toEqual({ ok: false, error: 'generic' })
  })
})
