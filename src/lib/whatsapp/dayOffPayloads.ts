/**
 * Reply payloads for the teacher day-off flow and the staff decision on it.
 *
 * Two namespaces, deliberately separate from the menu's `m:` and the role
 * switcher's `r:`:
 *
 *   `d:` — the teacher picking dates. Every step carries the dates chosen so
 *          far inside the payload, so there is no session row and a teacher can
 *          leave the conversation mid-pick and come back a day later.
 *   `a:` — a staff member acting on one request by id.
 *
 * Both decoders return null for anything that is not theirs, so a foreign reply
 * id falls through to normal intent handling rather than erroring. Whether the
 * *sender* may run what they decoded is a separate question answered by the
 * handlers: a reply id is client-supplied, and a teacher could echo back an
 * `a:approve:<id>` payload they were never shown.
 */

import { DateTime } from 'luxon'

const TEACHER_PREFIX = 'd'
const STAFF_PREFIX = 'a'

/** Longest absence bookable from the bot, inclusive of both endpoints. */
export const MAX_DAY_OFF_DAYS = 14

/** Day rows per list page — 8 leaves room for "more days" and "cancel". */
export const DAY_PAGE_SIZE = 8

/**
 * How far ahead the picker will page. A teacher planning further out than a
 * quarter is doing something the dashboard handles better.
 */
const MAX_OFFSET = 90

export type DayOffPayload =
  /** Show the start-date list, starting `offset` days from today. */
  | { step: 'pick'; offset: number }
  /** Start date chosen — ask how long. */
  | { step: 'start'; startDate: string }
  /** Page the end-date list for a chosen start date. */
  | { step: 'endpick'; startDate: string; offset: number }
  /** Range chosen — ask to confirm. */
  | { step: 'end'; startDate: string; endDate: string }
  /** Confirmed — create the request. */
  | { step: 'confirm'; startDate: string; endDate: string }
  /** Backed out. */
  | { step: 'abort' }

export type StaffRequestAction = 'show' | 'approve' | 'reject'

export type StaffRequestPayload = { action: StaffRequestAction; requestId: string }

// ── Encoding ──────────────────────────────────────────────────────────────────

export function encodeDayOffPayload(payload: DayOffPayload): string {
  switch (payload.step) {
    case 'pick':
      return `${TEACHER_PREFIX}:pick:${payload.offset}`
    case 'start':
      return `${TEACHER_PREFIX}:start:${payload.startDate}`
    case 'endpick':
      return `${TEACHER_PREFIX}:endpick:${payload.startDate}:${payload.offset}`
    case 'end':
      return `${TEACHER_PREFIX}:end:${payload.startDate}:${payload.endDate}`
    case 'confirm':
      return `${TEACHER_PREFIX}:confirm:${payload.startDate}:${payload.endDate}`
    case 'abort':
      return `${TEACHER_PREFIX}:abort`
  }
}

export function encodeStaffRequestPayload(
  action: StaffRequestAction,
  requestId: string
): string {
  return `${STAFF_PREFIX}:${action}:${requestId}`
}

// ── Decoding ──────────────────────────────────────────────────────────────────

/**
 * Parses a tapped day-off payload against `today` in the org's timezone.
 *
 * Dates are re-validated here rather than trusted: the payload was last seen by
 * the client, and a tap can arrive days after the list was sent, by which time a
 * date that was "tomorrow" is in the past.
 */
export function decodeDayOffPayload(
  replyId: string | undefined,
  timezone: string
): DayOffPayload | null {
  if (!replyId) return null
  const parts = replyId.split(':')
  if (parts[0] !== TEACHER_PREFIX || parts.length < 2) return null

  const today = DateTime.now().setZone(timezone).startOf('day')

  switch (parts[1]) {
    case 'abort':
      return parts.length === 2 ? { step: 'abort' } : null

    case 'pick': {
      if (parts.length !== 3) return null
      const offset = parseOffset(parts[2])
      return offset === null ? null : { step: 'pick', offset }
    }

    case 'start': {
      if (parts.length !== 3) return null
      const startDate = parseFutureDate(parts[2], today)
      return startDate === null ? null : { step: 'start', startDate }
    }

    case 'endpick': {
      if (parts.length !== 4) return null
      const startDate = parseFutureDate(parts[2], today)
      const offset = parseOffset(parts[3])
      if (startDate === null || offset === null) return null
      return { step: 'endpick', startDate, offset }
    }

    case 'end':
    case 'confirm': {
      if (parts.length !== 4) return null
      const range = parseRange(parts[2], parts[3], today)
      if (!range) return null
      return parts[1] === 'end'
        ? { step: 'end', ...range }
        : { step: 'confirm', ...range }
    }

    default:
      return null
  }
}

/** Parses a tapped staff decision payload ("a:approve:<uuid>"). */
export function decodeStaffRequestPayload(
  replyId: string | undefined
): StaffRequestPayload | null {
  if (!replyId) return null
  const parts = replyId.split(':')
  if (parts[0] !== STAFF_PREFIX || parts.length !== 3) return null

  const action = parts[1]
  if (action !== 'show' && action !== 'approve' && action !== 'reject') return null

  const requestId = parts[2]
  // Shape check only — that the request exists and belongs to this org is
  // re-checked against the database before anything is decided.
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return null

  return { action, requestId }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** An ISO date (yyyy-MM-dd) that is today or later in the org's timezone. */
function parseFutureDate(value: string, today: DateTime): string | null {
  const dt = DateTime.fromFormat(value, 'yyyy-MM-dd', { zone: today.zone })
  if (!dt.isValid) return null
  if (dt < today) return null
  if (dt.diff(today, 'days').days > MAX_OFFSET + MAX_DAY_OFF_DAYS) return null
  return value
}

function parseRange(
  startRaw: string,
  endRaw: string,
  today: DateTime
): { startDate: string; endDate: string } | null {
  const startDate = parseFutureDate(startRaw, today)
  const endDate = parseFutureDate(endRaw, today)
  if (startDate === null || endDate === null) return null

  const start = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: today.zone })
  const end = DateTime.fromFormat(endDate, 'yyyy-MM-dd', { zone: today.zone })

  const days = end.diff(start, 'days').days
  if (days < 0 || days > MAX_DAY_OFF_DAYS - 1) return null

  return { startDate, endDate }
}

function parseOffset(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null
  const offset = Number(value)
  return offset > MAX_OFFSET ? null : offset
}

/**
 * The calendar dates a request covers, as ISO strings. Used to write one
 * availability override per day.
 */
export function datesInRange(startDate: string, endDate: string, timezone: string): string[] {
  const start = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: timezone })
  const end = DateTime.fromFormat(endDate, 'yyyy-MM-dd', { zone: timezone })
  if (!start.isValid || !end.isValid || end < start) return []

  const dates: string[] = []
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    dates.push(d.toFormat('yyyy-MM-dd'))
  }
  return dates
}

/** "20/08" for a single day, "20/08–22/08" for a range. */
export function formatDateRange(startDate: string, endDate: string, timezone: string): string {
  const start = DateTime.fromFormat(startDate, 'yyyy-MM-dd', { zone: timezone })
  const end = DateTime.fromFormat(endDate, 'yyyy-MM-dd', { zone: timezone })
  if (!start.isValid || !end.isValid) return startDate

  const from = start.toFormat('dd/MM')
  return startDate === endDate ? from : `${from}–${end.toFormat('dd/MM')}`
}
