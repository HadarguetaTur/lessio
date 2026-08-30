/**
 * Hebrew-calendar holiday computation for auto-populated org holidays.
 *
 * The day-set is fixed Hebrew dates (erev chag + chag, Israeli one-day yom
 * tov schedule) rather than hebcal event filtering — Hoshana Raba and the
 * eve of Shvi'i shel Pesach are flagged CHOL_HAMOED in hebcal, so no flag
 * mask isolates exactly these days. Only HDate is used, for the
 * Hebrew→Gregorian conversion.
 *
 * MIRROR: supabase/functions/_shared/hebrewHolidays.ts (Deno) must keep
 * HOLIDAY_DEFS and the computation identical to this file.
 */

import { HDate, months } from '@hebcal/core'
import { DateTime } from 'luxon'
import type { AppLocale } from '@/lib/i18n/locale'

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
 * ahead of UTC (e.g. Asia/Jerusalem).
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
  const from = DateTime.fromISO(fromISO)
  const to = from.plus({ months: horizonMonths })

  const firstHYear = new HDate(new Date(from.year, from.month - 1, from.day)).getFullYear()
  const lastHYear = new HDate(new Date(to.year, to.month - 1, to.day)).getFullYear()

  const result: ComputedHoliday[] = []
  for (let hyear = firstHYear; hyear <= lastHYear; hyear++) {
    result.push(...computeHolidaysForHebrewYear(hyear, locale))
  }
  return result
    .filter((h) => h.date >= fromISO)
    .sort((a, b) => a.date.localeCompare(b.date))
}
