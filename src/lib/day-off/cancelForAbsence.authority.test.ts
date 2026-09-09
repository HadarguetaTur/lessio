/**
 * Regression: the absence path must not be a second, cheaper cancellation.
 *
 * `cancelLessons` used to be a raw bulk `UPDATE lessons SET status='cancelled'`.
 * A teacher could therefore reach `/teacher/overrides`, block her own day, tick
 * "cancel the lessons", and waive every fee the org policy would have charged
 * had she pressed cancel on those same lessons one screen over — with no
 * owner approval anywhere in the path, and no `student_cancellation_events`
 * row to show a monthly bill why the lesson vanished.
 *
 * These tests pin the two halves of the fix:
 *   1. every cancellation goes through `cancelLessonCore`;
 *   2. the waiver rides on the AUTHORITY, not on the door.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockCancelLessonCore = vi.fn()

vi.mock('@/lib/cancellation-flow/cancelLessonCore', () => ({
  cancelLessonCore: (input: unknown) => mockCancelLessonCore(input),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: () => ({}) }),
}))

vi.mock('@/lib/whatsapp', () => ({ sendTextMessage: vi.fn() }))
vi.mock('@/lib/whatsapp/interactive', () => ({ sendTemplateWithQuickReplies: vi.fn() }))
vi.mock('@/lib/whatsapp/consent', () => ({ prepareBusinessSend: vi.fn() }))
vi.mock('@/lib/whatsapp/templates', () => ({ resolveTemplate: vi.fn() }))
vi.mock('@/lib/crypto', () => ({ decryptToken: vi.fn() }))

import { cancelLessons, type AbsenceWindow, type AbsenceAuthority } from './cancelForAbsence'

type Db = Parameters<typeof cancelLessons>[0]

function windowWith(authority: AbsenceAuthority): AbsenceWindow {
  return {
    orgId: 'org-1',
    teacherId: 'teacher-1',
    authority,
    gte: '2026-09-20T05:00:00.000Z',
    lt: '2026-09-21T05:00:00.000Z',
    label: '20/09/2026',
    teacherName: 'Dana',
  }
}

/** A db stub that would explode if the old bulk UPDATE came back. */
const explodingDb = {
  from: () => {
    throw new Error('cancelLessons must not touch the lessons table directly')
  },
} as unknown as Db

beforeEach(() => {
  mockCancelLessonCore.mockReset()
  mockCancelLessonCore.mockResolvedValue({ success: true })
})

describe('cancelLessons — absence cancellation authority', () => {
  it("prices a teacher's OWN unapproved block under the org policy", async () => {
    const cancelled = await cancelLessons(explodingDb, windowWith({ kind: 'teacher_self' }), [
      'lesson-a',
      'lesson-b',
    ])

    expect(cancelled).toBe(2)
    expect(mockCancelLessonCore).toHaveBeenCalledTimes(2)

    for (const [input] of mockCancelLessonCore.mock.calls) {
      // The teacher actor is the one `cancelLessonCore` refuses to let waive.
      expect(input.actor).toEqual({ kind: 'teacher', teacherId: 'teacher-1' })
      expect(input.waive).toBe(false)
      expect(input.orgId).toBe('org-1')
    }
  })

  it('waives only when an owner/admin authorised the absence', async () => {
    await cancelLessons(explodingDb, windowWith({ kind: 'staff' }), ['lesson-a'])

    const [input] = mockCancelLessonCore.mock.calls[0]
    expect(input.actor).toEqual({ kind: 'staff' })
    expect(input.waive).toBe(true)
  })

  it('treats an already-cancelled lesson as a no-op rather than a failure', async () => {
    mockCancelLessonCore
      .mockResolvedValueOnce({ success: false, error: 'already_cancelled' })
      .mockResolvedValueOnce({ success: true })

    const cancelled = await cancelLessons(explodingDb, windowWith({ kind: 'staff' }), ['a', 'b'])

    expect(cancelled).toBe(1)
  })

  it('falls back to a plain status move only for an empty roster', async () => {
    mockCancelLessonCore.mockResolvedValue({ success: false, error: 'no_students' })

    const update = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const db = { from: () => ({ update }) } as unknown as Db

    const cancelled = await cancelLessons(db, windowWith({ kind: 'teacher_self' }), ['lesson-a'])

    expect(cancelled).toBe(1)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', cancel_reason: 'TEACHER_DAY_OFF' })
    )
  })
})
