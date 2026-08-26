/**
 * Reply payloads for buttons attached to proactive messages — a lesson
 * reminder, a homework assignment (`att:` and `hw:`).
 *
 * These differ from the menu's `m:` payloads in one way that matters: they name
 * a specific entity, and they arrive on a message the bot sent hours or days
 * earlier. So they are stateless like the day-off `d:` flow, the id is
 * shape-checked here and ownership is re-checked against the database in the
 * handler — a reply id is client-supplied, and could name someone else's lesson.
 *
 * They also have to be dispatched before the webhook forks on the sender's
 * preferred capacity: a reminder goes to a phone, not to a role, and a phone
 * that is both a parent and a teacher would otherwise route the tap into the
 * teacher flow, which knows nothing about it.
 */

const ATTENDANCE_PREFIX = 'att'
const HOMEWORK_PREFIX = 'hw'

const UUID = /^[0-9a-f-]{36}$/i

export type AttendancePayload =
  /** Confirmed they will be there. */
  | { kind: 'attendance'; action: 'ok'; lessonId: string }
  /** Wants to cancel this specific lesson — hands off to the cancellation flow. */
  | { kind: 'attendance'; action: 'cancel'; lessonId: string }

export type HomeworkPayload = { kind: 'homework'; action: 'done'; assignmentId: string }

export type EntityPayload = AttendancePayload | HomeworkPayload

// ── Encoding ──────────────────────────────────────────────────────────────────

export function encodeAttendancePayload(action: 'ok' | 'cancel', lessonId: string): string {
  return `${ATTENDANCE_PREFIX}:${action}:${lessonId}`
}

export function encodeHomeworkPayload(assignmentId: string): string {
  return `${HOMEWORK_PREFIX}:done:${assignmentId}`
}

// ── Decoding ──────────────────────────────────────────────────────────────────

/** Parses an `att:` or `hw:` payload. Null for anything else, so it falls through. */
export function decodeEntityPayload(replyId: string | undefined): EntityPayload | null {
  if (!replyId) return null
  const parts = replyId.split(':')
  if (parts.length !== 3) return null

  const [prefix, action, id] = parts
  if (!UUID.test(id)) return null

  if (prefix === ATTENDANCE_PREFIX && (action === 'ok' || action === 'cancel')) {
    return { kind: 'attendance', action, lessonId: id }
  }

  if (prefix === HOMEWORK_PREFIX && action === 'done') {
    return { kind: 'homework', action: 'done', assignmentId: id }
  }

  return null
}
