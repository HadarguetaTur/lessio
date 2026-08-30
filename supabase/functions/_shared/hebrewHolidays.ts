/**
 * Hebrew-calendar holiday computation — Deno mirror.
 *
 * MIRROR: src/lib/holidays/hebrewHolidays.ts (Node/Next) is the source of
 * truth. HOLIDAY_DEFS and the computation must stay identical; only the
 * import specifier and the month arithmetic (no Luxon here) differ.
 */

import { HDate, months } from 'npm:@hebcal/core@5'

export type AppLocale = 'he' | 'en'

export type ComputedHoliday = {
  date: string // 'YYYY-MM-DD'
  name: string
}

type HolidayDef = {
  dd: number
  mm: number
  /** Elul belongs to the previous Hebrew year (and always has 29 days). */
  yearOffset?: -1
  name: { he: string; en: string }
}

export const HOLIDAY_DEFS: HolidayDef[] = [
  { dd: 29, mm: months.ELUL, yearOffset: -1, name: { he: 'ערב ראש השנה', en: 'Erev Rosh Hashana' } },
  { dd: 1, mm: months.TISHREI, name: { he: 'ראש השנה א׳', en: 'Rosh Hashana I' } },
  { dd: 2, mm: months.TISHREI, name: { he: 'ראש השנה ב׳', en: 'Rosh Hashana II' } },
  { dd: 9, mm: months.TISHREI, name: { he: 'ערב יום כיפור', en: 'Erev Yom Kippur' } },
  { dd: 10, mm: months.TISHREI, name: { he: 'יום כיפור', en: 'Yom Kippur' } },
  { dd: 14, mm: months.TISHREI, name: { he: 'ערב סוכות', en: 'Erev Sukkot' } },
  { dd: 15, mm: months.TISHREI, name: { he: 'סוכות', en: 'Sukkot' } },
  { dd: 21, mm: months.TISHREI, name: { he: 'הושענא רבה', en: 'Hoshana Raba' } },
  { dd: 22, mm: months.TISHREI, name: { he: 'שמחת תורה / שמיני עצרת', en: 'Shmini Atzeret / Simchat Torah' } },
  { dd: 14, mm: months.NISAN, name: { he: 'ערב פסח', en: 'Erev Pesach' } },
  { dd: 15, mm: months.NISAN, name: { he: 'פסח', en: 'Pesach' } },
  { dd: 20, mm: months.NISAN, name: { he: 'ערב שביעי של פסח', en: 'Erev Shvi’i shel Pesach' } },
  { dd: 21, mm: months.NISAN, name: { he: 'שביעי של פסח', en: 'Shvi’i shel Pesach' } },
  { dd: 5, mm: months.SIVAN, name: { he: 'ערב שבועות', en: 'Erev Shavuot' } },
  { dd: 6, mm: months.SIVAN, name: { he: 'שבועות', en: 'Shavuot' } },
]

/**
 * HDate.greg() returns a Date at *local* midnight. Format from local
 * components — never toISOString(), which shifts a day back on any TZ
 * ahead of UTC.
 */
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function computeHolidaysForHebrewYear(hyear: number, locale: AppLocale): ComputedHoliday[] {
  return HOLIDAY_DEFS.map((def) => {
    const hd = new HDate(def.dd, def.mm, hyear + (def.yearOffset ?? 0))
    return { date: toISODate(hd.greg()), name: def.name[locale] }
  })
}

/**
 * All holidays from `fromISO` (inclusive) through roughly `horizonMonths`
 * ahead. Covers every Hebrew year touching the window; a few rows past the
 * horizon are harmless — the sync upsert is idempotent.
 */
export function computeUpcomingHolidays(
  fromISO: string,
  locale: AppLocale,
  horizonMonths = 18
): ComputedHoliday[] {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const from = new Date(fy, fm - 1, fd)
  const to = new Date(fy, fm - 1 + horizonMonths, fd)

  const firstHYear = new HDate(from).getFullYear()
  const lastHYear = new HDate(to).getFullYear()

  const result: ComputedHoliday[] = []
  for (let hyear = firstHYear; hyear <= lastHYear; hyear++) {
    result.push(...computeHolidaysForHebrewYear(hyear, locale))
  }
  return result
    .filter((h) => h.date >= fromISO)
    .sort((a, b) => a.date.localeCompare(b.date))
}
