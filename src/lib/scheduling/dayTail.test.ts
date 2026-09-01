/**
 * Org timezone is UTC throughout, so the "HH:MM" values in the assertions are
 * the same clock the ISO lesson fixtures show.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findDayTail } from './dayTail'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

const ORG_ID = 'org-1'
const TEACHER_ID = 'teacher-1'
const DATE = '2026-03-23' // Monday

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'gte', 'lte', 'gt', 'lt', 'neq', 'limit', 'order'].forEach((m) => {
    self[m] = pass
  })
  self['single'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return self
}

interface Setup {
  /** Weekly grid windows for the weekday. */
  weekly?: { start_time: string; end_time: string }[]
  overrides?: {
    is_available: boolean
    start_time: string | null
    end_time: string | null
    reason?: string | null
  }[]
  /** Lesson end instants, UTC ISO. */
  lessonEnds?: string[]
  orgBreak?: number
  teacherBreak?: number | null
  tailPromptEnabled?: boolean
  holiday?: boolean
  /** Bot-bookable durations; the shortest is the threshold. */
  botDurations?: number[]
}

function setup(o: Setup) {
  const durations = (o.botDurations ?? [30, 60]).map((minutes) => ({
    minutes,
    bot: true,
    teacher: true,
    admin: true,
  }))

  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'organizations':
        return buildChain({
          data: {
            timezone: 'UTC',
            break_duration_minutes: o.orgBreak ?? 0,
            tail_prompt_enabled: o.tailPromptEnabled ?? true,
            lesson_duration_settings: durations,
          },
          error: null,
        })
      case 'teachers':
        return buildChain({
          data: { break_duration_minutes: o.teacherBreak ?? null },
          error: null,
        })
      case 'organization_holidays':
        return buildChain({ data: o.holiday ? { id: 'h1' } : null, error: null })
      case 'availability_overrides':
        return buildChain({ data: o.overrides ?? [], error: null })
      case 'availability':
        return buildChain({ data: o.weekly ?? [], error: null })
      case 'lessons':
        return buildChain({
          data: (o.lessonEnds ?? []).map((end_at) => ({ end_at })),
          error: null,
        })
      default:
        return buildChain({ data: [], error: null })
    }
  })
}

const find = () => findDayTail({ orgId: ORG_ID, teacherId: TEACHER_ID, date: DATE })

describe('findDayTail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports the remainder the slot generator silently drops', async () => {
    // 16:00-19:30 with hour-long lessons: the generator offers 16:00, 17:00,
    // 18:00 and discards 19:00-19:30. Shortest bookable is 30, and 30 is not
    // shorter than 30 — so make the day end 19:20 to leave a true remainder.
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:20:00' }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
    })

    expect(await find()).toEqual({ start: '19:00', end: '19:20', minutes: 20 })
  })

  it('counts the break as part of what is unusable', async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:30:00' }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
      orgBreak: 15,
    })

    // 19:00 + 15 break → the day really ends at 19:15, leaving 15 minutes.
    expect(await find()).toEqual({ start: '19:15', end: '19:30', minutes: 15 })
  })

  it("prefers the teacher's own break", async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:30:00' }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
      orgBreak: 0,
      teacherBreak: 20,
    })

    expect(await find()).toEqual({ start: '19:20', end: '19:30', minutes: 10 })
  })

  it('says nothing when the remainder is still bookable', async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '20:00:00' }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
      botDurations: [30, 60],
    })

    // A full 60 minutes is left — a parent can take it.
    expect(await find()).toBeNull()
  })

  it('says nothing when the day ends exactly on the last lesson', async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:00:00' }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
    })

    expect(await find()).toBeNull()
  })

  it('does not treat an empty evening as a leftover', async () => {
    // The lesson is in the morning window; the evening is simply free.
    setup({
      weekly: [
        { start_time: '09:00:00', end_time: '11:00:00' },
        { start_time: '16:00:00', end_time: '19:20:00' },
      ],
      lessonEnds: ['2026-03-23T10:00:00.000Z'],
    })

    expect(await find()).toBeNull()
  })

  it('measures against the last window, not the first', async () => {
    setup({
      weekly: [
        { start_time: '09:00:00', end_time: '11:00:00' },
        { start_time: '16:00:00', end_time: '19:20:00' },
      ],
      lessonEnds: ['2026-03-23T10:00:00.000Z', '2026-03-23T19:00:00.000Z'],
    })

    expect(await find()).toEqual({ start: '19:00', end: '19:20', minutes: 20 })
  })

  it('measures against a blocked-down window, not the raw one', async () => {
    // The teacher blocked 19:00-19:30, so the day really ends at 19:00 and the
    // 18:50 lesson leaves only ten minutes.
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:30:00' }],
      overrides: [{ is_available: false, start_time: '19:00:00', end_time: '19:30:00' }],
      lessonEnds: ['2026-03-23T18:50:00.000Z'],
    })

    expect(await find()).toEqual({ start: '18:50', end: '19:00', minutes: 10 })
  })

  it('measures against special hours when the date has them', async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '23:00:00' }],
      overrides: [{ is_available: true, start_time: '16:00:00', end_time: '19:20:00' }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
    })

    expect(await find()).toEqual({ start: '19:00', end: '19:20', minutes: 20 })
  })

  it('says nothing on a day the teacher closed outright', async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:20:00' }],
      overrides: [{ is_available: false, start_time: null, end_time: null }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
    })

    expect(await find()).toBeNull()
  })

  it('says nothing on an organization holiday', async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:20:00' }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
      holiday: true,
    })

    expect(await find()).toBeNull()
  })

  it('says nothing when the organization turned the prompt off', async () => {
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:20:00' }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
      tailPromptEnabled: false,
    })

    expect(await find()).toBeNull()
  })

  it('says nothing when the teacher has no hours that day', async () => {
    setup({ weekly: [], lessonEnds: ['2026-03-23T19:00:00.000Z'] })

    expect(await find()).toBeNull()
  })

  it('says nothing when the break swallows the rest of the day', async () => {
    // 19:00 + 40 break lands past the 19:20 end: there is no remainder, the
    // teacher is simply done.
    setup({
      weekly: [{ start_time: '16:00:00', end_time: '19:20:00' }],
      lessonEnds: ['2026-03-23T19:00:00.000Z'],
      orgBreak: 40,
    })

    expect(await find()).toBeNull()
  })
})
