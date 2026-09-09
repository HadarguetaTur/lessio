/**
 * Date parsing and skip-word detection for the WhatsApp exam-report flow.
 */

import { DateTime } from 'luxon'

const SKIP_WORDS = new Set(['דלג', 'דלגי', 'skip', 'no', 'לא'])

/** True when the typed answer means "no file, finish without one". */
export function isSkipWord(text: string): boolean {
  return SKIP_WORDS.has(text.trim().toLowerCase())
}

/**
 * Parses "15/09", "15.9", "15/09/2027" or "2027-09-15" into an ISO date in the
 * org's timezone. A day/month with no year lands on this year, or next year
 * when that date has already passed — an exam being reported is ahead, not
 * behind.
 */
export function parseExamDate(text: string, timezone: string): string | null {
  return parseExamDateTime(text, timezone)?.date ?? null
}

/**
 * The same date, plus an optional time typed after it ("15/9 10:00").
 *
 * A student who tells us when the exam starts gets the good-luck message a
 * couple of hours before it rather than first thing in the morning; one who
 * types only a date is not asked again, because the morning default is a fine
 * answer and an extra conversation step is not.
 */
export function parseExamDateTime(
  text: string,
  timezone: string
): { date: string; time: string | null } | null {
  const raw = text.trim()

  // Split a trailing time off the end: "15/9 10:00", "15/9 בשעה 10:00", "15/9, 10".
  const timeMatch = raw.match(/(?:^|[\s,])(?:בשעה\s*|at\s*)?([01]?\d|2[0-3])(?::([0-5]\d))?\s*$/)
  let time: string | null = null
  let datePart = raw

  // Only treat the tail as a time when something is left over to be the date —
  // a bare "10" is a day of the month, not an hour.
  if (timeMatch && timeMatch.index !== undefined && timeMatch.index > 0) {
    // "15/09, 14:00" leaves a trailing comma the date parser would reject.
    const candidate = raw.slice(0, timeMatch.index).replace(/[\s,]+$/, '').trim()
    if (candidate) {
      datePart = candidate
      time = `${String(Number(timeMatch[1])).padStart(2, '0')}:${timeMatch[2] ?? '00'}`
    }
  }

  const date = parseDateOnly(datePart, timezone)
  if (!date) return null
  return { date, time }
}

function parseDateOnly(text: string, timezone: string): string | null {
  const trimmed = text.trim()
  const today = DateTime.now().setZone(timezone).startOf('day')

  const iso = DateTime.fromISO(trimmed, { zone: timezone })
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && iso.isValid) return iso.toISODate()

  const m = trimmed.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/)
  if (!m) return null

  const day = Number(m[1])
  const month = Number(m[2])
  let year = m[3] ? Number(m[3]) : today.year
  if (year < 100) year += 2000

  let dt = DateTime.fromObject({ day, month, year }, { zone: timezone })
  if (!dt.isValid) return null

  if (!m[3] && dt < today) dt = dt.plus({ years: 1 })
  return dt.toISODate()
}
