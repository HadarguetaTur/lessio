/**
 * SCHED-04 — extending a series ran only a holiday check.
 *
 * An extension writes exactly the same rows as creation, and creation checks
 * the student's other lessons and any slot lock a parent is holding. Extending
 * was therefore the one way to book a student into two places at once, or to
 * land on top of a slot somebody was five minutes from confirming.
 *
 * The teacher-overlap backstop is deliberately NOT replaced by a query: the
 * no_teacher_lesson_overlap EXCLUDE rejects the insert, and the last test here
 * proves that rejection is still honoured as a skipped occurrence rather than
 * crashing the extension.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DateTime } from 'luxon'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }),
}))

// Extend now runs the same write-time slot authority the parent booking path
// does — availability windows, holidays and the duration whitelist. Its own
// behaviour is pinned in assertSlotBookable's suite; here it is stubbed so
// these fixtures keep testing the extension loop, and the two tests at the
// bottom of this file pin that extend actually calls it.
const mockAssertSlotBookable = vi.fn()
vi.mock('@/lib/booking/assertSlotBookable', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/booking/assertSlotBookable')>()),
  assertSlotBookable: (p: unknown) => mockAssertSlotBookable(p),
}))

import { extendLessonSeries } from './updateSeries'
import { SlotNotBookableError } from '@/lib/booking/assertSlotBookable'

const ORG_ID = 'org-1'
const SERIES_ID = 'series-1'
const TEACHER_ID = 'teacher-1'
const STUDENT_ID = 'student-1'
const TZ = 'Asia/Jerusalem'

/** Thursday 17:00 local, weekly. The template lesson sits in the past. */
const RULE = {
  frequency: 'weekly' as const,
  day_of_week: 4,
  start_time: '17:00',
  duration_minutes: 60,
  until: '2027-03-18',
}

interface Scenario {
  studentBusy?: boolean
  lockHeld?: boolean
  /** Insert rejections, in order — '23P01' is the overlap EXCLUDE. */
  insertErrors?: (string | null)[]
}

let inserted: { start_at: string; end_at: string }[]

function wire(scenario: Scenario = {}) {
  const { studentBusy = false, lockHeld = false, insertErrors = [] } = scenario
  inserted = []
  let insertCount = 0

  function chain(result: unknown, onInsert?: (row: Record<string, unknown>) => unknown) {
    const self: Record<string, unknown> = {}
    const pass = () => self
    ;['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'order', 'limit', 'update', 'delete'].forEach(
      (m) => { self[m] = pass }
    )
    self['insert'] = (row: Record<string, unknown>) => (onInsert ? onInsert(row) : self)
    self['single'] = () => Promise.resolve(result)
    self['maybeSingle'] = () => Promise.resolve(result)
    self['then'] = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
    return self
  }

  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'lesson_series':
        return chain({ data: { id: SERIES_ID, teacher_id: TEACHER_ID, rule: RULE }, error: null })
      case 'organizations':
        return chain({ data: { timezone: TZ }, error: null })
      case 'organization_holidays':
        return chain({ data: [], error: null })
      case 'lesson_students':
        // Reading the junction for the student-conflict check; also the write
        // side of a created occurrence.
        return chain({ data: studentBusy ? [{ lesson_id: 'other-lesson' }] : [], error: null })
      case 'slot_locks':
        return chain({ data: lockHeld ? [{ id: 'lock-1' }] : [], error: null })
      case 'lessons': {
        const isTemplateRead = mockFrom.mock.calls.filter((c) => c[0] === 'lessons').length === 1
        if (isTemplateRead) {
          return chain({
            data: {
              start_at: '2027-03-18T15:00:00.000Z',
              lesson_type: 'individual',
              max_students: 1,
              price_per_student: null,
              group_id: null,
              lesson_students: [{ student_id: STUDENT_ID }],
            },
            error: null,
          })
        }
        // Student-conflict lookup and the occurrence insert share this table.
        return chain({ data: studentBusy ? [{ id: 'other-lesson' }] : [], error: null }, (row) => {
          const err = insertErrors[insertCount++] ?? null
          if (!err) {
            inserted.push({ start_at: row.start_at as string, end_at: row.end_at as string })
          }
          return {
            select: () => ({
              single: async () =>
                err
                  ? { data: null, error: { code: err, message: err } }
                  : { data: { id: `lesson-${insertCount}` }, error: null },
            }),
          }
        })
      }
      default:
        return chain({ data: null, error: null })
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertSlotBookable.mockResolvedValue(undefined)
})

describe('extendLessonSeries', () => {
  it('creates the missing occurrences when nothing is in the way', async () => {
    wire()
    const result = await extendLessonSeries(SERIES_ID, ORG_ID, '2027-04-08')

    expect(result.affected).toBeGreaterThan(0)
    expect(result.conflicts).toEqual([])
  })

  it('skips an occurrence where a student is already booked', async () => {
    // The check the create path always had and this one never did.
    wire({ studentBusy: true })
    const result = await extendLessonSeries(SERIES_ID, ORG_ID, '2027-04-08')

    expect(result.affected).toBe(0)
    expect(result.conflicts.length).toBeGreaterThan(0)
    expect(inserted).toEqual([])
  })

  it('skips an occurrence sitting on a slot lock a parent is holding', async () => {
    wire({ lockHeld: true })
    const result = await extendLessonSeries(SERIES_ID, ORG_ID, '2027-04-08')

    expect(result.affected).toBe(0)
    expect(inserted).toEqual([])
  })

  it('still treats a 23P01 overlap rejection as a skipped occurrence', async () => {
    // no_teacher_lesson_overlap remains the authority on teacher clashes. It
    // must keep landing as a conflict, not as a thrown error that abandons the
    // rest of the extension.
    wire({ insertErrors: ['23P01'] })
    const result = await extendLessonSeries(SERIES_ID, ORG_ID, '2027-04-08')

    expect(result.conflicts.length).toBe(1)
    expect(result.affected).toBeGreaterThan(0)
  })

  it('rebuilds 17:00 as 17:00 across the Asia/Jerusalem DST change', async () => {
    // Israel moves to UTC+3 on 2027-03-26. The wall clock is what the series
    // rule means, so the generated instants must shift, not the local hour.
    wire()
    await extendLessonSeries(SERIES_ID, ORG_ID, '2027-04-08')

    expect(inserted.length).toBeGreaterThanOrEqual(2)
    for (const row of inserted) {
      const local = DateTime.fromISO(row.start_at, { zone: 'utc' }).setZone(TZ)
      expect(local.toFormat('HH:mm')).toBe('17:00')
    }

    const offsets = new Set(
      inserted.map((r) => DateTime.fromISO(r.start_at, { zone: 'utc' }).setZone(TZ).offset)
    )
    // Proof the run really straddles the transition rather than passing by
    // accident on one side of it.
    expect(offsets.size).toBe(2)
  })

  it('asks the write-time slot authority for every occurrence it mints', async () => {
    // Extend used to read `organization_holidays`, student overlap and slot
    // locks and nothing else — never `availability_overrides`, never Google —
    // so pushing `until` forward minted up to 130 lessons straight through an
    // approved teacher vacation.
    wire()
    await extendLessonSeries(SERIES_ID, ORG_ID, '2027-04-08')

    expect(mockAssertSlotBookable).toHaveBeenCalled()
    expect(mockAssertSlotBookable.mock.calls.length).toBeGreaterThanOrEqual(inserted.length)
    for (const [params] of mockAssertSlotBookable.mock.calls) {
      expect(params).toMatchObject({
        orgId: ORG_ID,
        teacherId: TEACHER_ID,
        audience: 'admin',
        // A studio putting a lesson in its own diary is not a parent booking:
        // the parent notice window is the ONE rule staff may sit outside.
        skipMinNotice: true,
      })
    }
  })

  it('records a slot the authority refuses as a conflict, and keeps going', async () => {
    wire()
    mockAssertSlotBookable
      .mockRejectedValueOnce(new SlotNotBookableError('outside_availability'))
      .mockResolvedValue(undefined)

    const result = await extendLessonSeries(SERIES_ID, ORG_ID, '2027-04-08')

    expect(result.conflicts.length).toBe(1)
    // One blocked week must not abandon the other twenty-nine.
    expect(result.affected).toBeGreaterThan(0)
  })
})
