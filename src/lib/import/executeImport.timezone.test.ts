/**
 * The bug this file guards against is invisible on an Israeli developer's
 * machine: the importer built lesson instants from server-local `Date`
 * arithmetic, which is correct when the server clock happens to be
 * Asia/Jerusalem and wrong on Vercel, where it is UTC.
 *
 * So the process timezone is PINNED TO UTC here, before anything reads a clock,
 * and the test asserts that it really took effect. A run that silently fell
 * back to the machine's own zone would pass for the wrong reason — which is
 * exactly how this survived to production.
 */
process.env.TZ = 'UTC'

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DateTime } from 'luxon'
import { normalizeSeriesRule } from '@/lib/lessons/seriesRule'

const inserted: Record<string, Record<string, unknown>[]> = {}

vi.mock('@/lib/saas/quota', () => ({
  requireQuotaCapacity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => makeFakeClient(),
}))

/** Rows the importer looks up by name before it writes anything. */
const SEED = {
  teachers: [{ id: 'teacher-1', profile: { full_name: 'רות לוי' } }],
  students: [{ id: 'student-1', full_name: 'דנה כהן' }],
}

let insertSeq = 0

function makeFakeClient() {
  const select = (table: string) => ({
    eq() {
      return this
    },
    then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
      const data =
        table === 'teachers' ? SEED.teachers : table === 'students' ? SEED.students : []
      return Promise.resolve({ data, error: null }).then(resolve)
    },
  })

  return {
    from(table: string) {
      return {
        select: () => select(table),
        insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
          const rows = Array.isArray(payload) ? payload : [payload]
          const withIds = rows.map((r) => ({ ...r, id: `${table}-${++insertSeq}` }))
          inserted[table] = [...(inserted[table] ?? []), ...withIds]
          const result = {
            select: () => ({
              single: () => Promise.resolve({ data: withIds[0], error: null }),
              then: (r: (v: unknown) => unknown) =>
                Promise.resolve({ data: withIds, error: null }).then(r),
            }),
            then: (r: (v: unknown) => unknown) =>
              Promise.resolve({ data: withIds, error: null }).then(r),
          }
          return result
        },
      }
    },
  } as never
}

const t = (key: string) => key

function scheduleRow(data: Record<string, string>) {
  return { rowIndex: 0, status: 'valid' as const, data, errors: [], warnings: [] }
}

async function runImport(
  entityType: 'lessons-schedule' | 'lessons-history',
  data: Record<string, string>,
  timezone: string
) {
  const { executeImport } = await import('./executeImport')
  return executeImport('org-1', entityType, [scheduleRow(data)], timezone, t)
}

beforeEach(() => {
  for (const key of Object.keys(inserted)) delete inserted[key]
  insertSeq = 0
})

describe('the process timezone is pinned', () => {
  it('runs under UTC, not the developer machine zone', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(0)
  })
})

describe('importLessonSchedule — org timezone', () => {
  it('stores a 16:00 Jerusalem lesson as 13:00 UTC (summer, UTC+3)', async () => {
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'))

    await runImport(
      'lessons-schedule',
      {
        teacher_name: 'רות לוי',
        student_name: 'דנה כהן',
        day_of_week: '2', // Tuesday
        start_time: '16:00',
        duration_minutes: '60',
      },
      'Asia/Jerusalem'
    )

    const lessons = inserted.lessons ?? []
    expect(lessons).toHaveLength(4)

    for (const lesson of lessons) {
      const start = DateTime.fromISO(lesson.start_at as string, { zone: 'utc' })
      // The instant, read back in the org zone, must be the 16:00 the owner typed.
      expect(start.setZone('Asia/Jerusalem').toFormat('HH:mm')).toBe('16:00')
      // And the raw UTC instant is 13:00 — NOT 16:00Z, which is what
      // server-local arithmetic produced on a UTC runtime.
      expect(start.toFormat('HH:mm')).toBe('13:00')
      expect(start.setZone('Asia/Jerusalem').weekday).toBe(2) // Tuesday

      const end = DateTime.fromISO(lesson.end_at as string, { zone: 'utc' })
      expect(end.diff(start).as('minutes')).toBe(60)
    }

    vi.useRealTimers()
  })

  it('honours a different org timezone from the same input', async () => {
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'))

    await runImport(
      'lessons-schedule',
      {
        teacher_name: 'רות לוי',
        student_name: 'דנה כהן',
        day_of_week: '2',
        start_time: '16:00',
        duration_minutes: '60',
      },
      'America/New_York' // UTC-4 in July
    )

    const start = DateTime.fromISO(inserted.lessons[0].start_at as string, { zone: 'utc' })
    expect(start.toFormat('HH:mm')).toBe('20:00')

    vi.useRealTimers()
  })

  it('writes the canonical lesson_series.rule shape', async () => {
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'))

    await runImport(
      'lessons-schedule',
      {
        teacher_name: 'רות לוי',
        student_name: 'דנה כהן',
        day_of_week: '2',
        start_time: '9:05', // single-digit hour, as spreadsheets write it
        duration_minutes: '45',
      },
      'Asia/Jerusalem'
    )

    const rule = inserted.lesson_series[0].rule as Record<string, unknown>
    expect(rule).toEqual({
      frequency: 'weekly',
      day_of_week: 2,
      start_time: '09:05',
      duration_minutes: 45,
      until: '2026-07-28', // the 4th Tuesday, i.e. the last lesson created
    })

    // The stored horizon matches the last lesson that actually exists.
    const lastStart = (inserted.lessons ?? [])
      .map((l) => DateTime.fromISO(l.start_at as string).setZone('Asia/Jerusalem').toISODate())
      .sort()
      .at(-1)
    expect(lastStart).toBe(rule.until)

    // And a reader can consume it without special-casing.
    expect(normalizeSeriesRule(rule)).toEqual(rule)

    vi.useRealTimers()
  })

  it('rejects an unparseable start time by row instead of writing a bad instant', async () => {
    const result = await runImport(
      'lessons-schedule',
      {
        teacher_name: 'רות לוי',
        student_name: 'דנה כהן',
        day_of_week: '2',
        start_time: '25:99',
        duration_minutes: '60',
      },
      'Asia/Jerusalem'
    )

    expect(result.errors).toEqual([{ row: 2, message: 'executeErrors.invalidStartTime' }])
    expect(inserted.lessons).toBeUndefined()
    expect(inserted.lesson_series).toBeUndefined()
  })
})

describe('importLessonHistory — org timezone', () => {
  it('interprets DD/MM/YYYY in the org timezone, not the server zone', async () => {
    await runImport(
      'lessons-history',
      {
        teacher_name: 'רות לוי',
        student_name: 'דנה כהן',
        date: '15/01/2026',
        start_time: '16:00',
        end_time: '17:00',
      },
      'Asia/Jerusalem'
    )

    const lesson = inserted.lessons[0]
    // Winter: Jerusalem is UTC+2.
    expect(lesson.start_at).toBe('2026-01-15T14:00:00.000Z')
    expect(lesson.end_at).toBe('2026-01-15T15:00:00.000Z')
  })

  it('keeps a late-evening lesson on the owner’s calendar day and billing month', async () => {
    // 23:30 on 31 January in Jerusalem is 21:30Z on the 31st. Handled as server
    // -local time on a UTC runtime it would have been stored as 23:30Z — still
    // January here, but the general failure mode moves a lesson across the
    // month boundary that the billing engine groups by.
    await runImport(
      'lessons-history',
      {
        teacher_name: 'רות לוי',
        student_name: 'דנה כהן',
        date: '31/01/2026',
        start_time: '23:30',
        end_time: '00:30', // crosses midnight
      },
      'Asia/Jerusalem'
    )

    const lesson = inserted.lessons[0]
    expect(lesson.start_at).toBe('2026-01-31T21:30:00.000Z')
    // The end rolls into the next day rather than landing before the start.
    expect(lesson.end_at).toBe('2026-01-31T22:30:00.000Z')

    const start = DateTime.fromISO(lesson.start_at as string).setZone('Asia/Jerusalem')
    expect(start.toISODate()).toBe('2026-01-31')
    expect(start.toFormat('yyyy-MM')).toBe('2026-01')
  })

  it('puts a 00:30 lesson in the right month for a UTC-negative org', async () => {
    // 00:30 on 1 February in New York is 05:30Z on the 1st — the same instant
    // read in UTC is still February, but read in the org zone it must not slip
    // back into January.
    await runImport(
      'lessons-history',
      {
        teacher_name: 'רות לוי',
        student_name: 'דנה כהן',
        date: '01/02/2026',
        start_time: '00:30',
        end_time: '01:30',
      },
      'America/New_York'
    )

    const start = DateTime.fromISO(inserted.lessons[0].start_at as string)
    expect(start.toUTC().toISO()).toBe('2026-02-01T05:30:00.000Z')
    expect(start.setZone('America/New_York').toFormat('yyyy-MM-dd HH:mm')).toBe('2026-02-01 00:30')
  })

  it('names an unparseable date instead of silently storing Invalid Date', async () => {
    const result = await runImport(
      'lessons-history',
      {
        teacher_name: 'רות לוי',
        student_name: 'דנה כהן',
        date: '31/31/2026',
        start_time: '16:00',
        end_time: '17:00',
      },
      'Asia/Jerusalem'
    )

    expect(result.errors).toEqual([{ row: 2, message: 'executeErrors.invalidDate' }])
    expect(inserted.lessons).toBeUndefined()
  })

  it('reports a lesson whose student does not exist, by row and by name', async () => {
    const result = await runImport(
      'lessons-history',
      {
        teacher_name: 'רות לוי',
        student_name: 'מי שלא קיים',
        date: '15/01/2026',
        start_time: '16:00',
        end_time: '17:00',
      },
      'Asia/Jerusalem'
    )

    expect(result.errors).toEqual([{ row: 2, message: 'executeErrors.studentNotFound' }])
    expect(result.skipped).toBe(1)
    expect(inserted.lessons).toBeUndefined()
  })
})
