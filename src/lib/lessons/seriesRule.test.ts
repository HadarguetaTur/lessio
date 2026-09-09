import { describe, it, expect } from 'vitest'
import { normalizeSeriesRule, isLegacySeriesRule, normalizeClockTime } from './seriesRule'

/** Exactly what the schedule importer wrote before this was fixed. */
const LEGACY_RULE = { dayOfWeek: 2, startTime: '16:00', durationMinutes: 60 }

const CANONICAL_RULE = {
  frequency: 'weekly' as const,
  day_of_week: 2,
  start_time: '16:00',
  duration_minutes: 60,
  until: '2026-07-28',
}

describe('normalizeClockTime', () => {
  it.each([
    ['16:00', '16:00'],
    ['9:05', '09:05'],
    [' 07:30 ', '07:30'],
    ['00:00', '00:00'],
    ['23:59', '23:59'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeClockTime(input)).toBe(expected)
  })

  it.each(['24:00', '25:99', '16:0', 'noon', '', null, undefined, 16])(
    'rejects %s',
    (input) => {
      expect(normalizeClockTime(input)).toBeNull()
    }
  )
})

describe('normalizeSeriesRule', () => {
  it('passes a canonical rule through unchanged', () => {
    expect(normalizeSeriesRule(CANONICAL_RULE)).toEqual(CANONICAL_RULE)
  })

  it('reads the legacy camelCase rule the importer used to write', () => {
    expect(normalizeSeriesRule(LEGACY_RULE)).toEqual({
      frequency: 'weekly',
      day_of_week: 2,
      start_time: '16:00',
      duration_minutes: 60,
      until: '',
    })
  })

  it('fills a missing frequency and a missing horizon rather than returning undefined fields', () => {
    const rule = normalizeSeriesRule({ day_of_week: 0, start_time: '8:00', duration_minutes: '30' })
    expect(rule).toEqual({
      frequency: 'weekly',
      day_of_week: 0,
      start_time: '08:00',
      duration_minutes: 30,
      until: '',
    })
    // The point of the '' default: string operations on the horizon are safe.
    expect(() => rule!.until.localeCompare('2026-01-01')).not.toThrow()
  })

  it.each([
    ['null', null],
    ['a string', 'weekly'],
    ['an array', []],
    ['an empty object', {}],
    ['a rule with no time', { day_of_week: 2, duration_minutes: 60 }],
    ['a rule with a bad day', { day_of_week: 9, start_time: '16:00', duration_minutes: 60 }],
    ['a rule with a zero duration', { day_of_week: 2, start_time: '16:00', duration_minutes: 0 }],
  ])('returns null for %s instead of throwing', (_label, raw) => {
    expect(() => normalizeSeriesRule(raw)).not.toThrow()
    expect(normalizeSeriesRule(raw)).toBeNull()
  })

  it('lets one malformed row be skipped without poisoning a whole list', () => {
    // The failure mode this guards: a list page maps over every series in the
    // org and sorts by a rule field. One legacy or junk row used to throw
    // "Cannot read properties of undefined" and take down the entire page —
    // including the page an owner would use to fix the row.
    const stored = [
      { id: 'a', rule: CANONICAL_RULE },
      { id: 'b', rule: LEGACY_RULE },
      { id: 'c', rule: null },
      { id: 'd', rule: 'nonsense' },
      { id: 'e', rule: { frequency: 'biweekly', day_of_week: 4, start_time: '10:00', duration_minutes: 90, until: '2026-03-01' } },
    ]

    const rendered = stored
      .map((s) => ({ id: s.id, rule: normalizeSeriesRule(s.rule) }))
      .filter((s): s is { id: string; rule: NonNullable<ReturnType<typeof normalizeSeriesRule>> } => s.rule !== null)
      .sort((x, y) => x.rule.start_time.localeCompare(y.rule.start_time))

    expect(rendered.map((s) => s.id)).toEqual(['e', 'a', 'b'])
  })
})

describe('isLegacySeriesRule', () => {
  it('flags the rows a data migration needs to repair', () => {
    expect(isLegacySeriesRule(LEGACY_RULE)).toBe(true)
    expect(isLegacySeriesRule({ ...CANONICAL_RULE, until: undefined })).toBe(true)
    expect(isLegacySeriesRule({ ...CANONICAL_RULE, frequency: 'monthly' })).toBe(true)
    expect(isLegacySeriesRule(null)).toBe(true)
  })

  it('leaves a canonical rule alone', () => {
    expect(isLegacySeriesRule(CANONICAL_RULE)).toBe(false)
  })
})
