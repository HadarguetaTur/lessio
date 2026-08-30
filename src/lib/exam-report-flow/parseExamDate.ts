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
