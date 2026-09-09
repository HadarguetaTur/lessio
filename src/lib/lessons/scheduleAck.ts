/**
 * Proof that a human was actually shown a scheduling warning.
 *
 * The staff new-lesson forms have three "are you sure?" guards — the slot is
 * outside the teacher's availability, Google says the teacher is busy (or would
 * not answer), and the lesson would strand an unusable gap. Each could be
 * waived by resubmitting the form.
 *
 * The waiver used to be three raw FormData booleans:
 *
 *     formData.get('confirm_outside_availability') === '1'
 *
 * Nothing bound those to a warning the server had ever issued. Posting all
 * three on the FIRST request meant `assertNoCalendarConflicts` was never even
 * called — so a genuine `busy` diary and an `unknown_provider_error` were
 * equally undiscovered, and the acknowledgement the design leaned on was
 * something a caller simply asserted about itself. An acknowledgement a client
 * can mint is not an acknowledgement; it is an opt-out.
 *
 * This is the copilot's `cp:c:<sessionId>` idea without a table: the server
 * signs a token naming the EXACT slot it warned about and the kinds of warning
 * it raised, and only that token can waive those guards. It cannot be reused
 * for a different slot, a different org, a different guard, or after it expires.
 *
 * Key separation rather than a new env var: the signing key is derived from
 * `SUPPORT_SESSION_SECRET` (always required, length-checked) under a fixed
 * domain-separation label, so this signature can never be confused with a
 * support-session cookie and vice versa.
 */

import { createHmac, timingSafeEqual } from 'crypto'

/** The guards a token may waive. */
export type ScheduleAckKind = 'availability' | 'calendar' | 'schedule_impact'

export const SCHEDULE_ACK_FIELD = 'schedule_ack'

/**
 * Ten minutes. Long enough to read a dialog and decide; short enough that a
 * token scraped from a page cannot be replayed against a diary that has since
 * changed. The slot is re-validated on the way in regardless.
 */
const TTL_MS = 10 * 60 * 1000

const DOMAIN = 'lessio:schedule-ack:v1'

/** The slot a warning was about. Every field is part of the signature. */
export interface ScheduleAckSlot {
  orgId: string
  teacherId: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  startTime: string
  durationMinutes: number
}

interface AckPayload extends ScheduleAckSlot {
  kinds: ScheduleAckKind[]
  exp: number
}

function signingKey(): Buffer {
  const secret = process.env.SUPPORT_SESSION_SECRET
  if (!secret) {
    // Validated at startup by `validateEnv`; reaching here means the process
    // is misconfigured, and a schedule guard must not silently become a
    // rubber stamp because a secret is missing.
    throw new Error('[scheduleAck] SUPPORT_SESSION_SECRET is not set')
  }
  return createHmac('sha256', secret).update(DOMAIN).digest()
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

/**
 * Canonical, order-independent serialisation. `kinds` is sorted so a token
 * issued for {calendar, availability} verifies identically to one for
 * {availability, calendar} — the set is what matters, not the order the guards
 * happened to fire in.
 */
function canonical(payload: AckPayload): string {
  return JSON.stringify({
    orgId: payload.orgId,
    teacherId: payload.teacherId,
    date: payload.date,
    startTime: payload.startTime,
    durationMinutes: payload.durationMinutes,
    kinds: [...payload.kinds].sort(),
    exp: payload.exp,
  })
}

function mac(body: string): string {
  return b64url(createHmac('sha256', signingKey()).update(body).digest())
}

/**
 * Issues a token waiving exactly `kinds` for exactly `slot`.
 *
 * Called only from the branch that has ALREADY run the guard and is about to
 * tell the user about it. There is no path that mints a token without having
 * raised the warning it waives — that is the whole property.
 */
export function issueScheduleAck(
  slot: ScheduleAckSlot,
  kinds: ScheduleAckKind[],
  now: number = Date.now()
): string {
  const payload: AckPayload = { ...slot, kinds: [...kinds].sort(), exp: now + TTL_MS }
  const body = b64url(Buffer.from(canonical(payload)))
  return `${body}.${mac(body)}`
}

/**
 * The set of guards this token legitimately waives for this slot. Empty for a
 * missing, malformed, forged, expired or mismatched token — every failure is
 * the same answer, "nothing is acknowledged", because the caller's only correct
 * response to any of them is to run the guard.
 */
export function verifyScheduleAck(
  token: string | null | undefined,
  slot: ScheduleAckSlot,
  now: number = Date.now()
): Set<ScheduleAckKind> {
  const empty = new Set<ScheduleAckKind>()
  if (!token) return empty

  const dot = token.lastIndexOf('.')
  if (dot <= 0) return empty

  const body = token.slice(0, dot)
  const provided = token.slice(dot + 1)

  const expected = mac(body)
  // Constant time, and length-checked first: timingSafeEqual throws on a
  // length mismatch, which would itself be an oracle if it escaped.
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return empty

  let payload: AckPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AckPayload
  } catch {
    return empty
  }

  if (typeof payload?.exp !== 'number' || payload.exp <= now) return empty

  // The signature proves WE issued it; this proves it is about THIS slot. A
  // token minted for next Tuesday must not wave through today's booking.
  if (
    payload.orgId !== slot.orgId ||
    payload.teacherId !== slot.teacherId ||
    payload.date !== slot.date ||
    payload.startTime !== slot.startTime ||
    payload.durationMinutes !== slot.durationMinutes
  ) {
    return empty
  }

  const kinds = Array.isArray(payload.kinds) ? payload.kinds : []
  return new Set(
    kinds.filter((k): k is ScheduleAckKind =>
      k === 'availability' || k === 'calendar' || k === 'schedule_impact'
    )
  )
}
