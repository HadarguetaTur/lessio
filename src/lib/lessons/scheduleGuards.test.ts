/**
 * The Google Calendar guard's three answers, as the lesson form sees them.
 *
 * The form renders one dialog for two situations, so the state it receives
 * must tell them apart: `calendarCheckFailed` is what turns "Google Calendar
 * conflict — events were found" into "Google Calendar could not be read".
 * Without it a dead connection showed staff a conflict with no event in it.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock('@/lib/availability/availabilityNotice', () => ({
  buildAvailabilityNotice: vi.fn(async () => null),
}))

vi.mock('@/lib/scheduling/scheduleImpact', () => ({
  analyzeScheduleImpact: vi.fn(async () => null),
}))

vi.mock('@/lib/google-calendar/checkLessonCalendarConflicts', () => ({
  checkLessonCalendarConflicts: vi.fn(),
}))

import { checkLessonCalendarConflicts } from '@/lib/google-calendar/checkLessonCalendarConflicts'
import { verifyScheduleAck } from './scheduleAck'
import { runScheduleGuards } from './scheduleGuards'

const mockCheck = vi.mocked(checkLessonCalendarConflicts)

const SLOT = {
  orgId: 'org-1',
  teacherId: 'teacher-1',
  date: '2027-01-19',
  startTime: '18:00',
  durationMinutes: 60,
}

const RUN = { slot: SLOT, role: 'owner', audience: 'admin' as const, ackToken: null }

beforeAll(() => {
  process.env.SUPPORT_SESSION_SECRET = 'test-secret-for-schedule-guards-0123456789'
})

beforeEach(() => vi.clearAllMocks())

describe('runScheduleGuards — the Google Calendar guard', () => {
  it('proceeds silently when the calendar is free', async () => {
    mockCheck.mockResolvedValue({ conflicts: [], status: 'free' })

    expect(await runScheduleGuards(RUN)).toBeNull()
  })

  it('reports the conflicts it found, without the failed flag', async () => {
    const conflict = {
      start: '2027-01-19T16:00:00Z', end: '2027-01-19T17:00:00Z', calendar: 'org' as const, label: null,
    }
    mockCheck.mockResolvedValue({ conflicts: [conflict], status: 'busy' })

    const state = await runScheduleGuards(RUN)

    expect(state).toMatchObject({
      error: 'lessons.conflicts.googleCalendar',
      needsCalendarConfirm: true,
      calendarConflicts: [conflict],
    })
    expect(state?.calendarCheckFailed).toBeUndefined()
    expect(state?.scheduleAck).toBeTruthy()
  })

  it('says the calendar could not be read — not that a conflict was found', async () => {
    mockCheck.mockResolvedValue({ conflicts: [], status: 'unknown_provider_error' })

    const state = await runScheduleGuards(RUN)

    expect(state).toMatchObject({
      error: 'lessons.conflicts.googleCalendarUnavailable',
      needsCalendarConfirm: true,
      calendarCheckFailed: true,
      calendarConflicts: [],
    })
    // The token it hands back waives exactly this guard for this slot.
    expect(verifyScheduleAck(state!.scheduleAck!, SLOT).has('calendar')).toBe(true)
  })

  it('does not ask Google again once the calendar guard is acknowledged', async () => {
    mockCheck.mockResolvedValue({ conflicts: [], status: 'unknown_provider_error' })
    const first = await runScheduleGuards(RUN)

    mockCheck.mockClear()
    const second = await runScheduleGuards({ ...RUN, ackToken: first!.scheduleAck! })

    expect(second).toBeNull()
    expect(mockCheck).not.toHaveBeenCalled()
  })
})
