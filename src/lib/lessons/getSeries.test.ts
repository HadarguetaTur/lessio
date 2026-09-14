/**
 * One malformed row must never poison the list.
 *
 * `lesson_series.rule` is jsonb, and the schedule importer used to write
 * `{ dayOfWeek, startTime, durationMinutes }` — camelCase, with no `frequency`
 * and no `until`. getLessonSeriesList sorts on `rule.start_time.localeCompare`,
 * so a single such row threw `TypeError: Cannot read properties of undefined
 * (reading 'localeCompare')` and took down the entire recurring-lessons page —
 * the only page from which an owner could have repaired that series.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readSeriesRuleForDisplay } from './seriesRule'

/** What the importer wrote before the shape was fixed. */
const LEGACY_RULE = { dayOfWeek: 3, startTime: '9:05', durationMinutes: 45 }

const CANONICAL_RULE = {
  frequency: 'weekly',
  day_of_week: 1,
  start_time: '16:00',
  duration_minutes: 60,
  until: '2026-07-28',
}

let seriesRows: Record<string, unknown>[] = []

vi.mock('@/lib/lessons/seriesFootprint', () => ({
  loadSeriesFootprint: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const rows =
        table === 'lesson_series' ? seriesRows : table === 'lessons' ? [] : []
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        eq: self,
        gte: self,
        in: self,
        not: self,
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      })
      return chain
    },
  }),
}))

function seriesRow(id: string, rule: unknown) {
  return {
    id,
    student_id: `student-${id}`,
    rule,
    stopped_at: null,
    teachers: { profiles: { full_name: 'רות לוי' } },
    student_groups: null,
  }
}

beforeEach(() => {
  seriesRows = []
})

describe('getLessonSeriesList with a legacy imported row', () => {
  it('still renders the list, and still contains the good row', async () => {
    seriesRows = [seriesRow('legacy', LEGACY_RULE), seriesRow('good', CANONICAL_RULE)]

    const { getLessonSeriesList } = await import('./getSeries')
    const list = await getLessonSeriesList('org-1')

    // The whole point: this call used to throw.
    expect(list).toHaveLength(2)

    const good = list.find((s) => s.id === 'good')
    expect(good).toBeDefined()
    expect(good!.rule).toEqual(CANONICAL_RULE)
    expect(good!.ruleIsComplete).toBe(true)
  })

  it('reads the legacy row rather than discarding it, and flags it as incomplete', async () => {
    seriesRows = [seriesRow('legacy', LEGACY_RULE)]

    const { getLessonSeriesList } = await import('./getSeries')
    const [item] = await getLessonSeriesList('org-1')

    expect(item.rule).toEqual({
      frequency: 'weekly',
      day_of_week: 3,
      start_time: '09:05', // padded, so localeCompare sorts correctly
      duration_minutes: 45,
      until: '', // the legacy shape carries no horizon
    })
    expect(item.ruleIsComplete).toBe(false)
  })

  it('sorts a mixed list without throwing, legacy rows included', async () => {
    seriesRows = [
      seriesRow('legacy-late', { dayOfWeek: 1, startTime: '18:00', durationMinutes: 60 }),
      seriesRow('canonical', CANONICAL_RULE), // Monday 16:00
      seriesRow('sunday', { ...CANONICAL_RULE, day_of_week: 0, start_time: '08:00' }),
    ]

    const { getLessonSeriesList } = await import('./getSeries')
    const list = await getLessonSeriesList('org-1')

    // Sunday first, then Monday 16:00, then Monday 18:00.
    expect(list.map((s) => s.id)).toEqual(['sunday', 'canonical', 'legacy-late'])
  })

  it('pins the exact crash the raw read used to cause', () => {
    // The old comparator, verbatim. It throws whenever a legacy row lands in
    // the `a` position — so the page died for some orderings of the same data
    // and not others, which is why this looked intermittent.
    const rawComparator = (a: { rule: never }, b: { rule: never }) =>
      // @ts-expect-error — reproducing the untyped read on purpose
      a.rule.day_of_week - b.rule.day_of_week || a.rule.start_time.localeCompare(b.rule.start_time)

    const legacy = { rule: LEGACY_RULE } as never
    const canonical = { rule: CANONICAL_RULE } as never

    expect(() => rawComparator(legacy, canonical)).toThrow(TypeError)

    // Through the defensive reader the same pair compares cleanly.
    const safe = (x: unknown, y: unknown) => {
      const ra = readSeriesRuleForDisplay(x).rule
      const rb = readSeriesRuleForDisplay(y).rule
      return ra.day_of_week - rb.day_of_week || ra.start_time.localeCompare(rb.start_time)
    }
    expect(() => safe(LEGACY_RULE, CANONICAL_RULE)).not.toThrow()
    expect(safe(LEGACY_RULE, CANONICAL_RULE)).toBeGreaterThan(0) // Wed after Mon
  })

  it.each([
    ['null', null],
    ['a string', 'weekly'],
    ['an empty object', {}],
    ['a rule with no time at all', { day_of_week: 2 }],
  ])('survives a rule that is %s', async (_label, rule) => {
    seriesRows = [seriesRow('junk', rule), seriesRow('good', CANONICAL_RULE)]

    const { getLessonSeriesList } = await import('./getSeries')
    const list = await getLessonSeriesList('org-1')

    expect(list).toHaveLength(2)
    expect(list.find((s) => s.id === 'good')!.rule).toEqual(CANONICAL_RULE)

    const junk = list.find((s) => s.id === 'junk')!
    expect(junk.ruleIsComplete).toBe(false)
    // Every field is present and the right type, so the page cannot explode.
    expect(typeof junk.rule.start_time).toBe('string')
    expect(typeof junk.rule.day_of_week).toBe('number')
    expect(typeof junk.rule.until).toBe('string')
  })
})
