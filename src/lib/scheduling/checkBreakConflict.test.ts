/**
 * Org timezone is UTC throughout so the wall-clock strings in the assertions
 * are the same instants as the ISO fixtures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkBreakConflict } from './checkBreakConflict'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

const ORG_ID = 'org-1'
const TEACHER_ID = 'teacher-1'
const DATE = '2026-03-23'

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'gte', 'lte', 'gt', 'lt', 'neq', 'order'].forEach((m) => {
    self[m] = pass
  })
  self['single'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej)
  return self
}

/** orgBreak / teacherBreak drive the effective break; `lessons` is the day. */
function setup(opts: {
  orgBreak: number
  teacherBreak?: number | null
  lessons?: { id: string; start_at: string; end_at: string }[]
}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'organizations') {
      return buildChain({
        data: { break_duration_minutes: opts.orgBreak, timezone: 'UTC' },
        error: null,
      })
    }
    if (table === 'teachers') {
      return buildChain({
        data: { break_duration_minutes: opts.teacherBreak ?? null },
        error: null,
      })
    }
    if (table === 'lessons') return buildChain({ data: opts.lessons ?? [], error: null })
    return buildChain({ data: [], error: null })
  })
}

const call = (over: Partial<Parameters<typeof checkBreakConflict>[0]> = {}) =>
  checkBreakConflict({
    orgId: ORG_ID,
    teacherId: TEACHER_ID,
    date: DATE,
    startTime: '12:00',
    durationMinutes: 60,
    ...over,
  })

describe('checkBreakConflict', () => {
  beforeEach(() => vi.clearAllMocks())

  it('says nothing when the teacher needs no break', async () => {
    setup({
      orgBreak: 0,
      lessons: [
        { id: 'l1', start_at: '2026-03-23T11:00:00.000Z', end_at: '2026-03-23T12:00:00.000Z' },
      ],
    })

    expect(await call()).toBeNull()
  })

  it('reports a lesson that ends too close before the proposed one', async () => {
    setup({
      orgBreak: 15,
      lessons: [
        { id: 'l1', start_at: '2026-03-23T11:00:00.000Z', end_at: '2026-03-23T12:00:00.000Z' },
      ],
    })

    const result = await call()

    expect(result).not.toBeNull()
    expect(result!.requiredMinutes).toBe(15)
    expect(result!.lessons).toEqual([
      { id: 'l1', start: '11:00', end: '12:00', gapMinutes: 0, side: 'before' },
    ])
  })

  it('reports a lesson that starts too soon after the proposed one', async () => {
    setup({
      orgBreak: 30,
      lessons: [
        { id: 'l2', start_at: '2026-03-23T13:10:00.000Z', end_at: '2026-03-23T14:00:00.000Z' },
      ],
    })

    const result = await call()

    expect(result!.lessons).toEqual([
      { id: 'l2', start: '13:10', end: '14:00', gapMinutes: 10, side: 'after' },
    ])
  })

  it('stays silent when the gap is exactly the break', async () => {
    setup({
      orgBreak: 15,
      lessons: [
        { id: 'l1', start_at: '2026-03-23T10:00:00.000Z', end_at: '2026-03-23T11:45:00.000Z' },
      ],
    })

    expect(await call()).toBeNull()
  })

  // A genuine overlap is createLesson's business — it throws. Reporting it here
  // too would show the user a break warning for what is actually a hard clash.
  it('ignores a lesson that truly overlaps', async () => {
    setup({
      orgBreak: 15,
      lessons: [
        { id: 'l1', start_at: '2026-03-23T12:30:00.000Z', end_at: '2026-03-23T13:30:00.000Z' },
      ],
    })

    expect(await call()).toBeNull()
  })

  it('does not judge a lesson being edited against itself', async () => {
    setup({
      orgBreak: 15,
      lessons: [
        { id: 'l1', start_at: '2026-03-23T11:00:00.000Z', end_at: '2026-03-23T12:00:00.000Z' },
      ],
    })

    expect(await call({ excludeLessonId: 'l1' })).toBeNull()
  })

  it("uses the teacher's own break over the organization default", async () => {
    setup({
      orgBreak: 0,
      teacherBreak: 45,
      lessons: [
        { id: 'l1', start_at: '2026-03-23T10:30:00.000Z', end_at: '2026-03-23T11:30:00.000Z' },
      ],
    })

    const result = await call()

    expect(result!.requiredMinutes).toBe(45)
    expect(result!.lessons[0].gapMinutes).toBe(30)
  })

  it('reports a lesson on each side at once', async () => {
    setup({
      orgBreak: 20,
      lessons: [
        { id: 'before', start_at: '2026-03-23T11:00:00.000Z', end_at: '2026-03-23T11:50:00.000Z' },
        { id: 'after', start_at: '2026-03-23T13:05:00.000Z', end_at: '2026-03-23T14:00:00.000Z' },
      ],
    })

    const result = await call()

    expect(result!.lessons.map((l) => [l.id, l.side, l.gapMinutes])).toEqual([
      ['before', 'before', 10],
      ['after', 'after', 5],
    ])
  })
})
