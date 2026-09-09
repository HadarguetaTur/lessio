/**
 * Write-time slot validation (SCHED-02).
 *
 * Every case here is a page that went stale between render and submit. The
 * rendered list of slots is advisory; this is the authoritative answer, and it
 * has to say no even though the client is holding a start/end pair that was
 * perfectly valid when it was drawn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DateTime } from 'luxon'
import { assertSlotBookable, SlotNotBookableError } from './assertSlotBookable'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

const ORG_ID = 'org-1'
const TEACHER_ID = 'teacher-1'

/** Well clear of any notice horizon, and in Asia/Jerusalem winter time. */
const START = '2027-01-19T16:00:00.000Z' // 18:00 local
const END = '2027-01-19T17:00:00.000Z'   // 19:00 local

function buildChain(result: unknown) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq', 'gt', 'gte', 'lt', 'lte', 'neq', 'in', 'order', 'limit'].forEach((m) => {
    self[m] = pass
  })
  self['single'] = () => Promise.resolve(result)
  self['maybeSingle'] = () => Promise.resolve(result)
  self['then'] = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return self
}

interface Fixture {
  org?: Record<string, unknown>
  holiday?: unknown
  overrides?: unknown[]
  weekly?: { start_time: string; end_time: string }[]
}

function wire(fixture: Fixture = {}) {
  const {
    org = { timezone: 'Asia/Jerusalem', min_booking_notice_hours: 0 },
    holiday = null,
    overrides = [],
    weekly = [{ start_time: '08:00:00', end_time: '22:00:00' }],
  } = fixture

  mockFrom.mockImplementation((table: string) => {
    if (table === 'organizations') return buildChain({ data: org, error: null })
    if (table === 'organization_holidays') return buildChain({ data: holiday, error: null })
    if (table === 'availability_overrides') return buildChain({ data: overrides, error: null })
    if (table === 'availability') return buildChain({ data: weekly, error: null })
    return buildChain({ data: null, error: null })
  })
}

async function reasonFor(params: Partial<Parameters<typeof assertSlotBookable>[0]> = {}) {
  try {
    await assertSlotBookable({
      orgId: ORG_ID,
      teacherId: TEACHER_ID,
      startUtc: START,
      endUtc: END,
      audience: 'bot',
      ...params,
    })
  } catch (err) {
    if (err instanceof SlotNotBookableError) return err.reason
    throw err
  }
  return null
}

beforeEach(() => vi.clearAllMocks())

describe('assertSlotBookable', () => {
  it('accepts a slot inside an open weekly window', async () => {
    wire()
    await expect(reasonFor()).resolves.toBeNull()
  })

  // ── The finding this exists for ────────────────────────────────────────────

  it('refuses a slot on a weekday the teacher has removed from the grid', async () => {
    // The parent's page still shows Tuesday 18:00 because it was rendered
    // before the teacher deleted that weekday. Nothing on the old write path
    // asked "is this inside an OPEN window" — only "is it inside a block".
    wire({ weekly: [] })
    await expect(reasonFor()).resolves.toBe('outside_availability')
  })

  it('refuses a slot that starts inside a window but runs past its end', async () => {
    // 18:00–19:00 local against a window that closes at 18:30.
    wire({ weekly: [{ start_time: '08:00:00', end_time: '18:30:00' }] })
    await expect(reasonFor()).resolves.toBe('outside_availability')
  })

  it('refuses a slot outside the window on the early side too', async () => {
    wire({ weekly: [{ start_time: '19:00:00', end_time: '22:00:00' }] })
    await expect(reasonFor()).resolves.toBe('outside_availability')
  })

  it('still refuses hours blocked by an exception, as it always did', async () => {
    wire({ overrides: [{ is_available: false, start_time: '17:00', end_time: '20:00' }] })
    await expect(reasonFor()).resolves.toBe('outside_availability')
  })

  it('refuses a whole day the teacher blocked after the list was drawn', async () => {
    wire({ overrides: [{ is_available: false, start_time: null, end_time: null }] })
    await expect(reasonFor()).resolves.toBe('outside_availability')
  })

  it('honours special hours for the date over the weekly grid', async () => {
    // Special hours replace the grid entirely — 18:00 is outside them even
    // though the weekly rule would have allowed it.
    wire({
      weekly: [{ start_time: '08:00:00', end_time: '22:00:00' }],
      overrides: [{ is_available: true, start_time: '08:00', end_time: '12:00' }],
    })
    await expect(reasonFor()).resolves.toBe('outside_availability')
  })

  // ── The other four gaps ────────────────────────────────────────────────────

  it('refuses a start already in the past', async () => {
    wire()
    const past = DateTime.utc().minus({ hours: 2 })
    await expect(
      reasonFor({
        startUtc: past.toISO()!,
        endUtc: past.plus({ minutes: 60 }).toISO()!,
      })
    ).resolves.toBe('past')
  })

  it('refuses a slot inside the minimum booking notice', async () => {
    wire({ org: { timezone: 'Asia/Jerusalem', min_booking_notice_hours: 48 } })
    const soon = DateTime.utc().plus({ hours: 2 })
    await expect(
      reasonFor({
        startUtc: soon.toISO()!,
        endUtc: soon.plus({ minutes: 60 }).toISO()!,
      })
    ).resolves.toBe('min_notice')
  })

  it('refuses a duration that is not on the whitelist', async () => {
    // 37 minutes is not one of the defaults (30/45/60/90); the actions only
    // validate the duration the client *asked* for, never the one the
    // start/end pair encodes.
    wire()
    await expect(
      reasonFor({ endUtc: '2027-01-19T16:37:00.000Z' })
    ).resolves.toBe('duration_not_allowed')
  })

  it('applies the audience the caller names, not a global list', async () => {
    wire({
      org: {
        timezone: 'Asia/Jerusalem',
        min_booking_notice_hours: 0,
        lesson_duration_settings: [{ minutes: 60, bot: false, teacher: true, admin: true }],
      },
    })
    await expect(reasonFor({ audience: 'bot' })).resolves.toBe('duration_not_allowed')
    await expect(reasonFor({ audience: 'admin' })).resolves.toBeNull()
  })

  it('refuses a slot on an org holiday', async () => {
    wire({ holiday: { id: 'holiday-1' } })
    await expect(reasonFor()).resolves.toBe('holiday')
  })

  it('refuses an inverted or zero-length range outright', async () => {
    wire()
    await expect(reasonFor({ endUtc: START })).resolves.toBe('invalid_range')
    await expect(reasonFor({ startUtc: END, endUtc: START })).resolves.toBe('invalid_range')
  })

  // ── Wall-clock correctness ─────────────────────────────────────────────────

  it('compares wall clock in the org timezone, not UTC', async () => {
    // 16:00Z is 18:00 in Jerusalem. A window of 16:00–17:00 would contain the
    // slot if the comparison were done in UTC — it must not.
    wire({ weekly: [{ start_time: '16:00:00', end_time: '17:00:00' }] })
    await expect(reasonFor()).resolves.toBe('outside_availability')
  })

  it('keeps a 17:00 wall-clock slot bookable on both sides of the DST change', async () => {
    // Israel moves to UTC+3 on 2027-03-26. The same wall-clock hour is a
    // different instant either side of it, and both must land inside the same
    // 17:00–18:00 window.
    wire({ weekly: [{ start_time: '17:00:00', end_time: '18:00:00' }] })

    const before = DateTime.fromISO('2027-03-23T17:00:00', { zone: 'Asia/Jerusalem' })
    const after = DateTime.fromISO('2027-03-30T17:00:00', { zone: 'Asia/Jerusalem' })
    expect(before.offset).not.toBe(after.offset)

    for (const local of [before, after]) {
      await expect(
        reasonFor({
          startUtc: local.toUTC().toISO()!,
          endUtc: local.plus({ minutes: 60 }).toUTC().toISO()!,
        })
      ).resolves.toBeNull()
    }
  })
})
