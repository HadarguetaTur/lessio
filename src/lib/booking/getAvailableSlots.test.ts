/**
 * All test orgs use timezone: 'UTC' to eliminate DST ambiguity.
 * Availability windows, lesson times, and lock times are expressed as UTC ISO strings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAvailableSlots } from './getAvailableSlots'

// ── Module mock ───────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => fromMock(table) }),
}))

// Google Calendar busy time (decision #36) — defaults to none so the existing
// suite exercises the pre-calendar behaviour unchanged.
const mockExternalBusy = vi.fn().mockResolvedValue([])
vi.mock('@/lib/google-calendar/getExternalBusyIntervals', () => ({
  getExternalBusyIntervals: (...args: unknown[]) => mockExternalBusy(...args),
}))

// fromMock is reassigned per test
let fromMock: (table: string) => unknown = () => buildChain({ data: null, error: null })

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1'
const TEACHER_ID = 'teacher-1'
const DATE = '2026-03-23' // Monday in UTC

/** Base org with UTC timezone, no break, no min notice */
function baseOrg(overrides: Partial<{
  break_duration_minutes: number
  min_booking_notice_hours: number
}> = {}) {
  return {
    timezone: 'UTC',
    break_duration_minutes: 0,
    min_booking_notice_hours: 0,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getAvailableSlots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns slots within the availability window when nothing is blocked', async () => {
    // Availability: 16:00–18:00 UTC → two 60-min slots
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(2)
    expect(slots[0].startAt).toBe('2026-03-23T16:00:00.000Z')
    expect(slots[0].endAt).toBe('2026-03-23T17:00:00.000Z')
    expect(slots[1].startAt).toBe('2026-03-23T17:00:00.000Z')
    expect(slots[1].endAt).toBe('2026-03-23T18:00:00.000Z')
  })

  it('excludes a slot that overlaps with an existing lesson', async () => {
    // Lesson blocks 16:00–17:00 → only 17:00–18:00 slot available
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([
        { start_at: '2026-03-23T16:00:00.000Z', end_at: '2026-03-23T17:00:00.000Z' },
      ]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0].startAt).toBe('2026-03-23T17:00:00.000Z')
  })

  it('excludes a slot blocked by an active non-expired slot lock', async () => {
    // Lock covers 16:00–17:00 UTC → only 17:00 slot available
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([]),
      slot_locks: array([
        { start_at: '2026-03-23T16:00:00.000Z', end_at: '2026-03-23T17:00:00.000Z' },
      ]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0].startAt).toBe('2026-03-23T17:00:00.000Z')
  })

  it('does not let an expired slot lock block availability', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(2)
    expect(slots[0].startAt).toBe('2026-03-23T16:00:00.000Z')
    expect(slots[1].startAt).toBe('2026-03-23T17:00:00.000Z')
  })

  it('returns empty array when an override blocks the whole day', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([{ is_available: false, start_time: null, end_time: null }]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(0)
  })

  it('uses override window instead of recurring availability', async () => {
    // Recurring is 16:00–18:00 but override says 10:00–12:00 UTC
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([
        { is_available: true, start_time: '10:00:00', end_time: '12:00:00' },
      ]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(2)
    expect(slots[0].startAt).toBe('2026-03-23T10:00:00.000Z')
    expect(slots[1].startAt).toBe('2026-03-23T11:00:00.000Z')
  })

  it('accounts for break_duration_minutes between slots', async () => {
    // 16:00–18:30, 60-min lessons, 15-min break → 16:00 and 17:15 fit; 18:30 would not
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 15 })),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:30:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(2)
    expect(slots[0].startAt).toBe('2026-03-23T16:00:00.000Z')
    expect(slots[1].startAt).toBe('2026-03-23T17:15:00.000Z')
  })

  it('returns slots from all windows when the teacher has multiple windows on the same day', async () => {
    // Morning 10:00–11:00 and evening 16:00–18:00 → 1 + 2 slots, sorted by start
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([]),
      availability: array([
        { start_time: '16:00:00', end_time: '18:00:00' },
        { start_time: '10:00:00', end_time: '11:00:00' },
      ]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(3)
    expect(slots[0].startAt).toBe('2026-03-23T10:00:00.000Z')
    expect(slots[1].startAt).toBe('2026-03-23T16:00:00.000Z')
    expect(slots[2].startAt).toBe('2026-03-23T17:00:00.000Z')
  })

  it('returns empty array when no weekly availability is defined for the day', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([]),
      availability: array([]), // no records for this day
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(0)
  })

  it('excludes slots before the min_booking_notice_hours horizon', async () => {
    // min notice = 999 hours → every slot is in the past relative to the horizon
    fromMock = tableRouter({
      organizations: single(baseOrg({ min_booking_notice_hours: 999 })),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(0)
  })
})

// ── The break as a buffer around lessons ──────────────────────────────────────
//
// The stride tested above is only half of what the break means. These lock in
// the other half: a parent is never offered a slot that leaves the teacher no
// gap on either side of a lesson they already have.

describe('getAvailableSlots — break buffer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops the slot that would start the instant a lesson ends', async () => {
    // 16:00–19:00, lesson 16:00–17:00, break 15, 60-min slots.
    // Stride offers 16:00 and 17:15. Before the buffer, 17:00 was the second
    // candidate whenever the stride landed there; now the buffer runs to 17:15
    // and only a slot at or after it survives.
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 15 })),
      teachers: single({ break_duration_minutes: null }),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '19:00:00' }]),
      lessons: array([
        { start_at: '2026-03-23T16:00:00.000Z', end_at: '2026-03-23T17:00:00.000Z' },
      ]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    // 16:00 is the lesson itself; 17:15 is exactly one break after it ends.
    expect(slots.map(s => s.startAt)).toEqual(['2026-03-23T17:15:00.000Z'])
  })

  it('keeps the break clear on both sides of a lesson', async () => {
    // 15:00–19:00, lesson 17:00–18:00, break 30, 30-min slots.
    // Stride offers 15:00, 16:00, 17:00, 18:00. The buffered lesson spans
    // 16:30–18:30, which pins both boundaries exactly:
    //   16:00–16:30 ends the moment the buffer opens  → still offered
    //   18:00–18:30 sits inside the trailing buffer   → dropped
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 30 })),
      teachers: single({ break_duration_minutes: null }),
      availability_overrides: array([]),
      availability: array([{ start_time: '15:00:00', end_time: '19:00:00' }]),
      lessons: array([
        { start_at: '2026-03-23T17:00:00.000Z', end_at: '2026-03-23T18:00:00.000Z' },
      ]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 30,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual([
      '2026-03-23T15:00:00.000Z',
      '2026-03-23T16:00:00.000Z',
    ])
  })

  it('buffers an active slot lock the same way it buffers a lesson', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 30 })),
      teachers: single({ break_duration_minutes: null }),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '20:00:00' }]),
      lessons: array([]),
      slot_locks: array([
        { start_at: '2026-03-23T16:00:00.000Z', end_at: '2026-03-23T17:00:00.000Z' },
      ]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    // Stride puts candidates at 16:00, 17:30, 19:00. 17:30 clears the lock's
    // buffer (ends 17:30); 16:00 is the lock itself.
    expect(slots.map(s => s.startAt)).toEqual([
      '2026-03-23T17:30:00.000Z',
      '2026-03-23T19:00:00.000Z',
    ])
  })

  it("uses the teacher's break instead of the organization's", async () => {
    // Org says 0, teacher needs 30 → the 17:00 slot must disappear.
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 0 })),
      teachers: single({ break_duration_minutes: 30 }),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '20:00:00' }]),
      lessons: array([
        { start_at: '2026-03-23T16:00:00.000Z', end_at: '2026-03-23T17:00:00.000Z' },
      ]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual([
      '2026-03-23T17:30:00.000Z',
      '2026-03-23T19:00:00.000Z',
    ])
  })

  it('lets a teacher opt out of the org break with an explicit 0', async () => {
    // The distinction NULL vs 0 exists for exactly this: the business wants 30,
    // this teacher teaches back-to-back, and the parent may book 17:00.
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 30 })),
      teachers: single({ break_duration_minutes: 0 }),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([
        { start_at: '2026-03-23T16:00:00.000Z', end_at: '2026-03-23T17:00:00.000Z' },
      ]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual(['2026-03-23T17:00:00.000Z'])
  })

  it('inherits the org break when the teacher has no preference', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 30 })),
      teachers: single({ break_duration_minutes: null }),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([
        { start_at: '2026-03-23T16:00:00.000Z', end_at: '2026-03-23T17:00:00.000Z' },
      ]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(0)
  })

  // The asymmetry that makes the cadence test above still hold: a blocked range
  // is the teacher being absent, not busy, so no gap is owed around it.
  it('does not buffer a blocked range', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 30 })),
      teachers: single({ break_duration_minutes: null }),
      availability_overrides: array([
        { is_available: false, start_time: '17:00:00', end_time: '17:30:00' },
      ]),
      availability: array([{ start_time: '16:00:00', end_time: '19:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 30,
      organizationId: ORG_ID,
    })

    // Stride 30+30 → 16:00, 17:00, 18:00. 17:00 is the block itself; 18:00 is
    // offered even though it sits only 30 minutes after the block ends, and
    // 16:00 stands even though it ends 30 minutes before the block begins.
    expect(slots.map(s => s.startAt)).toEqual([
      '2026-03-23T16:00:00.000Z',
      '2026-03-23T18:00:00.000Z',
    ])
  })

  it('behaves exactly as before when no break is configured', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 0 })),
      teachers: single({ break_duration_minutes: null }),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([
        { start_at: '2026-03-23T16:00:00.000Z', end_at: '2026-03-23T17:00:00.000Z' },
      ]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual(['2026-03-23T17:00:00.000Z'])
  })
})

// ── Mock helpers ──────────────────────────────────────────────────────────────

/** Routes DB queries to per-table stub data. */
function tableRouter(map: Record<string, unknown>) {
  return (table: string) => {
    if (table in map) return map[table]
    // Default: supports all terminal types; data: null is safe for maybeSingle checks
    return buildChain({ data: null, error: null })
  }
}

/** Builds a chainable Supabase-like query stub that resolves via .single() */
function single(data: unknown) {
  return buildChain({ data, error: null })
}

/** Builds a chainable stub that resolves as an awaited array query */
function array(data: unknown[]) {
  return buildChain({ data, error: null })
}

function buildChain(result: { data: unknown; error: unknown }) {
  const self: Record<string, unknown> = {}
  const passThrough = () => self
  ;['select', 'eq', 'gte', 'lte', 'gt', 'lt', 'neq', 'in', 'limit', 'order'].forEach(m => {
    self[m] = passThrough
  })

  // Support all terminal types simultaneously
  self['single']      = () => Promise.resolve(result)
  self['maybySingle'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)

  // Make the chain itself awaitable (for array queries)
  self['then'] = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    return Promise.resolve(result).then(resolve, reject)
  }

  return self
}

// ── Partial-day blocks ────────────────────────────────────────────────────────

describe('getAvailableSlots — partial-day blocks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drops only the slots a blocked range covers', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([
        { is_available: false, start_time: '09:00:00', end_time: '11:00:00' },
      ]),
      availability: array([{ start_time: '09:00:00', end_time: '13:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual([
      '2026-03-23T11:00:00.000Z',
      '2026-03-23T12:00:00.000Z',
    ])
  })

  it('honours two blocked ranges on the same date', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([
        { is_available: false, start_time: '09:00:00', end_time: '10:00:00' },
        { is_available: false, start_time: '12:00:00', end_time: '13:00:00' },
      ]),
      availability: array([{ start_time: '09:00:00', end_time: '13:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual([
      '2026-03-23T10:00:00.000Z',
      '2026-03-23T11:00:00.000Z',
    ])
  })

  it('does not shift the afternoon cadence when a block bisects a window', async () => {
    // The reason blocks join blockedIntervals instead of splitting the window
    // list: a split re-anchors the cursor at the block end, sliding every later
    // slot off the org booking grid. With a 15-minute break this window yields
    // 09:00 / 10:15 / 11:30 / 12:45 — blocking 10:00-11:00 must remove the
    // 10:15 slot and leave the others exactly where they were.
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 15 })),
      availability_overrides: array([
        { is_available: false, start_time: '10:00:00', end_time: '11:00:00' },
      ]),
      availability: array([{ start_time: '09:00:00', end_time: '14:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual([
      '2026-03-23T09:00:00.000Z',
      '2026-03-23T11:30:00.000Z',
      '2026-03-23T12:45:00.000Z',
    ])
  })

  it('returns nothing when a whole-day block sits among ranged rows', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([
        { is_available: false, start_time: '09:00:00', end_time: '10:00:00' },
        { is_available: false, start_time: null, end_time: null },
      ]),
      availability: array([{ start_time: '09:00:00', end_time: '13:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toHaveLength(0)
  })

  it('subtracts a block from special hours rather than the weekly grid', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([
        { is_available: true, start_time: '09:00:00', end_time: '13:00:00' },
        { is_available: false, start_time: '10:00:00', end_time: '12:00:00' },
      ]),
      // Must be ignored entirely — special hours replace the weekly grid.
      availability: array([{ start_time: '20:00:00', end_time: '22:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual([
      '2026-03-23T09:00:00.000Z',
      '2026-03-23T12:00:00.000Z',
    ])
  })

  it('offers every special-hours window, not just the first', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([
        { is_available: true, start_time: '09:00:00', end_time: '10:00:00' },
        { is_available: true, start_time: '15:00:00', end_time: '16:00:00' },
      ]),
      availability: array([]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual([
      '2026-03-23T09:00:00.000Z',
      '2026-03-23T15:00:00.000Z',
    ])
  })
})

// ── Google Calendar busy time (decision #36) ─────────────────────────────────

describe('getAvailableSlots — external calendar busy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'))
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes a slot that overlaps a calendar busy interval', async () => {
    mockExternalBusy.mockResolvedValueOnce([
      { start: '2026-03-23T16:00:00.000Z', end: '2026-03-23T17:00:00.000Z' },
    ])

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual(['2026-03-23T17:00:00.000Z'])
  })

  it('does not break-widen calendar busy — a slot starting the moment it ends is offered', async () => {
    // Break 30: a *lesson* ending 16:00 would block the 16:00 slot via
    // widening; a calendar event ending 16:00 must not.
    fromMock = tableRouter({
      organizations: single(baseOrg({ break_duration_minutes: 30 })),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '17:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })
    mockExternalBusy.mockResolvedValueOnce([
      { start: '2026-03-23T15:00:00.000Z', end: '2026-03-23T16:00:00.000Z' },
    ])

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots.map(s => s.startAt)).toEqual(['2026-03-23T16:00:00.000Z'])
  })

  it('skips its own fetch when the caller passes prefetched busy intervals', async () => {
    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
      externalBusy: [
        { start: '2026-03-23T17:00:00.000Z', end: '2026-03-23T18:00:00.000Z' },
      ],
    })

    expect(mockExternalBusy).not.toHaveBeenCalled()
    expect(slots.map(s => s.startAt)).toEqual(['2026-03-23T16:00:00.000Z'])
  })

  it('fetches its own day window when no prefetch is given', async () => {
    await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(mockExternalBusy).toHaveBeenCalledTimes(1)
    expect(mockExternalBusy).toHaveBeenCalledWith({
      orgId: ORG_ID,
      teacherId: TEACHER_ID,
      windowStartUtc: '2026-03-23T00:00:00.000Z',
      windowEndUtc: '2026-03-23T23:59:59.999Z',
    })
  })

  it('never phones Google for a day closed by a holiday', async () => {
    fromMock = tableRouter({
      organizations: single(baseOrg()),
      organization_holidays: single({ id: 'holiday-1' }),
      availability_overrides: array([]),
      availability: array([{ start_time: '16:00:00', end_time: '18:00:00' }]),
      lessons: array([]),
      slot_locks: array([]),
    })

    const slots = await getAvailableSlots({
      teacherId: TEACHER_ID,
      date: DATE,
      durationMinutes: 60,
      organizationId: ORG_ID,
    })

    expect(slots).toEqual([])
    expect(mockExternalBusy).not.toHaveBeenCalled()
  })
})
