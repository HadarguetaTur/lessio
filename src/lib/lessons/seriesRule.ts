/**
 * The canonical `lesson_series.rule` shape, and a defensive reader for it.
 *
 * The column is `jsonb`, so nothing at the database level stops a writer from
 * storing a differently-shaped object. The schedule importer used to write
 * `{ dayOfWeek, startTime, durationMinutes }` — camelCase, with no `frequency`
 * and no `until` — while every reader expects the snake_case shape below. One
 * such row is enough to break any page that maps over all series, and that page
 * is exactly where an owner would go to fix it.
 *
 * `normalizeSeriesRule` is therefore the only supported way to read the column:
 * it accepts the legacy shape, fills defensible defaults, and returns `null`
 * rather than throwing when the value is unusable.
 */

export type SeriesFrequency = 'weekly' | 'biweekly'

/** Canonical stored shape. Matches the column comment in 20260330000004. */
export type SeriesRule = {
  frequency: SeriesFrequency
  day_of_week: number // 0=Sun … 6=Sat
  start_time: string // 'HH:MM' in the organization's timezone
  duration_minutes: number
  until: string // 'YYYY-MM-DD', inclusive
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Pad '9:05' to '09:05'; returns null for anything that is not a clock time. */
export function normalizeClockTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = TIME_RE.exec(value.trim())
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

function asFrequency(value: unknown): SeriesFrequency | null {
  return value === 'weekly' || value === 'biweekly' ? value : null
}

function asDayOfWeek(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 6) return null
  return n
}

function asPositiveInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return DATE_RE.test(trimmed) ? trimmed : null
}

/**
 * Read a `lesson_series.rule` value from the database.
 *
 * Accepts both the canonical shape and the legacy camelCase shape written by
 * the schedule importer before this was fixed. Returns `null` when the value
 * carries too little to be meaningful — callers should skip or flag that row,
 * never let it throw through a list.
 */
export function normalizeSeriesRule(raw: unknown): SeriesRule | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  const day_of_week = asDayOfWeek(r.day_of_week ?? r.dayOfWeek)
  const start_time = normalizeClockTime(r.start_time ?? r.startTime)
  const duration_minutes = asPositiveInt(r.duration_minutes ?? r.durationMinutes)

  // Without a day and a time the row describes nothing renderable.
  if (day_of_week === null || start_time === null || duration_minutes === null) {
    return null
  }

  return {
    // Legacy rows carry neither; weekly is what the importer generated.
    frequency: asFrequency(r.frequency) ?? 'weekly',
    day_of_week,
    start_time,
    duration_minutes,
    // Legacy rows have no horizon. An empty string reads as "unknown" and keeps
    // the shape total, so sorting and formatting cannot hit undefined.
    until: asIsoDate(r.until) ?? '',
  }
}

/** True when the stored value is missing fields the canonical shape requires. */
export function isLegacySeriesRule(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true
  const r = raw as Record<string, unknown>
  return (
    asFrequency(r.frequency) === null ||
    asDayOfWeek(r.day_of_week) === null ||
    normalizeClockTime(r.start_time) === null ||
    asPositiveInt(r.duration_minutes) === null ||
    asIsoDate(r.until) === null
  )
}
