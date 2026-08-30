import { describe, it, expect } from 'vitest'
import {
  HOLIDAY_DEFS,
  computeHolidaysForHebrewYear,
  computeUpcomingHolidays,
} from './hebrewHolidays'

// Known Gregorian dates for Hebrew year 5787, verified against hebcal.org.
// These pin the Hebrew→Gregorian conversion including the local-midnight
// formatting: the same expectations must pass on UTC CI and on an
// Asia/Jerusalem dev machine — that equality is the off-by-one guard.
const EXPECTED_5787: Record<string, string> = {
  'ערב ראש השנה': '2026-09-11',
  'ראש השנה א׳': '2026-09-12',
  'ראש השנה ב׳': '2026-09-13',
  'ערב יום כיפור': '2026-09-20',
  'יום כיפור': '2026-09-21',
  'ערב סוכות': '2026-09-25',
  'סוכות': '2026-09-26',
  'הושענא רבה': '2026-10-02',
  'שמחת תורה / שמיני עצרת': '2026-10-03',
  'ערב פסח': '2027-04-21',
  'פסח': '2027-04-22',
  'ערב שביעי של פסח': '2027-04-27',
  'שביעי של פסח': '2027-04-28',
  'ערב שבועות': '2027-06-10',
  'שבועות': '2027-06-11',
}

describe('computeHolidaysForHebrewYear', () => {
  it('produces the exact known dates for 5787', () => {
    const holidays = computeHolidaysForHebrewYear(5787, 'he')
    const byName = Object.fromEntries(holidays.map((h) => [h.name, h.date]))
    expect(byName).toEqual(EXPECTED_5787)
  })

  it('produces 15 unique ISO dates per year', () => {
    const holidays = computeHolidaysForHebrewYear(5787, 'he')
    expect(holidays).toHaveLength(HOLIDAY_DEFS.length)
    expect(holidays).toHaveLength(15)
    const dates = holidays.map((h) => h.date)
    expect(new Set(dates).size).toBe(15)
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('places Erev Rosh Hashana exactly one day before Rosh Hashana I (29 Elul of the previous Hebrew year)', () => {
    for (const hyear of [5786, 5787, 5788, 5789]) {
      const holidays = computeHolidaysForHebrewYear(hyear, 'en')
      const erev = holidays.find((h) => h.name === 'Erev Rosh Hashana')!
      const rh1 = holidays.find((h) => h.name === 'Rosh Hashana I')!
      const diffMs = Date.parse(rh1.date) - Date.parse(erev.date)
      expect(diffMs).toBe(24 * 60 * 60 * 1000)
    }
  })

  it('renders English names for locale en', () => {
    const holidays = computeHolidaysForHebrewYear(5787, 'en')
    const byName = Object.fromEntries(holidays.map((h) => [h.name, h.date]))
    expect(byName['Yom Kippur']).toBe('2026-09-21')
    expect(byName['Pesach']).toBe('2027-04-22')
    expect(byName['Shavuot']).toBe('2027-06-11')
  })
})

describe('computeUpcomingHolidays', () => {
  it('never includes dates before the from bound', () => {
    const holidays = computeUpcomingHolidays('2026-08-30', 'he')
    for (const h of holidays) expect(h.date >= '2026-08-30').toBe(true)
  })

  it('covers the full default 18-month horizon and is sorted', () => {
    const holidays = computeUpcomingHolidays('2026-08-30', 'he')
    // 5787 fully (Sep 2026 – Jun 2027) + 5788 Tishrei cluster (Sep–Oct 2027).
    const dates = holidays.map((h) => h.date)
    expect(dates).toContain('2026-09-12') // Rosh Hashana 5787
    expect(dates).toContain('2027-06-11') // Shavuot 5787
    expect(dates.some((d) => d >= '2027-09-01' && d <= '2027-10-31')).toBe(true) // Tishrei 5788
    expect(dates).toEqual([...dates].sort())
  })

  it('respects a custom horizon (excludes the next Hebrew year, keeps the rest of the current one)', () => {
    const short = computeUpcomingHolidays('2026-08-30', 'he', 2)
    // Two months ahead lands inside 5787, so all of 5787 is included (the
    // far end is deliberately not trimmed — extra rows are idempotent) but
    // nothing from 5788 (Tishrei 5788 starts September 2027).
    expect(short).toHaveLength(15)
    for (const h of short) expect(h.date <= '2027-06-11').toBe(true)
  })
})
