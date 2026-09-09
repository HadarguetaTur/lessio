/**
 * `executeCancellation` is now a thin adapter over `cancelLessonCore`, so what
 * is worth testing here is the adapting: that the parent-facing surface asks
 * the core the right question, and that it narrows the core's refusals without
 * losing one.
 *
 * The billing behaviour itself is covered in cancelLessonCore.test.ts — the
 * point of the change is that there is one implementation to test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCore = vi.fn()
vi.mock('./cancelLessonCore', () => ({
  cancelLessonCore: (...args: unknown[]) => mockCore(...args),
}))

import { executeCancellation } from './executeCancellation'

const SUCCESS = {
  success: true as const,
  billingMode: 'per_lesson' as const,
  lessonId: 'lesson-1',
  lessonStartAt: '2026-06-12T09:00:00.000Z',
  lessonEndAt: '2026-06-12T10:00:00.000Z',
  studentName: 'דנה',
  teacherName: 'שרה',
  lines: [],
  billedTotal: 150,
  pendingTotal: 0,
  chargeResult: { shouldCharge: true, chargeType: 'full' as const, amount: 150, reasonCode: 'full_charge' },
  alerts: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('executeCancellation', () => {
  it('asks the core to cancel as the parent who tapped cancel', async () => {
    mockCore.mockResolvedValue(SUCCESS)

    await executeCancellation('lesson-1', 'parent-9', 'org-1', 'portal')

    expect(mockCore).toHaveBeenCalledWith({
      lessonId: 'lesson-1',
      orgId: 'org-1',
      actor: { kind: 'parent', parentId: 'parent-9' },
      source: 'portal',
    })
  })

  it('defaults to the WhatsApp source', async () => {
    mockCore.mockResolvedValue(SUCCESS)
    await executeCancellation('lesson-1', 'parent-9', 'org-1')
    expect(mockCore.mock.calls[0][0].source).toBe('whatsapp')
  })

  it('returns the amount that was actually billed, and the pending one beside it', async () => {
    mockCore.mockResolvedValue({ ...SUCCESS, billedTotal: 0, pendingTotal: 150, chargeResult: { shouldCharge: false, chargeType: null, amount: 0, reasonCode: 'monthly_pending' } })

    const outcome = await executeCancellation('lesson-1', 'parent-9', 'org-1')

    expect(outcome.success).toBe(true)
    if (!outcome.success) return
    // A monthly org charged nothing now. Callers render chargeResult, so this
    // is what stops the bot quoting a fee it did not raise.
    expect(outcome.chargeResult.amount).toBe(0)
    expect(outcome.pendingTotal).toBe(150)
  })

  it.each([
    ['not_found', 'not_found'],
    ['already_cancelled', 'already_cancelled'],
    // A parent has no use for the distinction between these three.
    ['already_delivered', 'not_eligible'],
    ['forbidden', 'not_eligible'],
    ['no_students', 'not_eligible'],
    ['not_eligible', 'not_eligible'],
  ])('maps %s to %s', async (coreError, expected) => {
    mockCore.mockResolvedValue({ success: false, error: coreError })
    const outcome = await executeCancellation('lesson-1', 'parent-9', 'org-1')
    expect(outcome).toEqual({ success: false, error: expected })
  })
})
