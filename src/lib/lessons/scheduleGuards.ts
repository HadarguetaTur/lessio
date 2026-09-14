/**
 * The three "are you sure?" guards every staff lesson-creation path must run,
 * and the one place that decides whether they may be waived.
 *
 * This used to be copy-pasted three times inside the dashboard action and a
 * fourth time in the teacher shell, and the four disagreed. Two defects fell
 * straight out of that:
 *
 *  1. **The acknowledgement was forgeable.** Each guard was skipped by a raw
 *     FormData boolean (`confirm_calendar_conflict=1`) with no server-issued
 *     nonce — nothing bound it to a warning the server had ever raised.
 *     Posting all three on the FIRST request meant the calendar was never even
 *     read, so a genuine `busy` diary and an `unknown_provider_error` were
 *     equally undiscovered. An acknowledgement a client can simply claim is an
 *     opt-out wearing a seatbelt. It is now a signed token naming this exact
 *     slot and these exact guards — see ./scheduleAck.
 *
 *  2. **`status` was an undocumented fourth kill switch.** Every guard was
 *     gated `&& status === 'scheduled'`, and `status` is a client-chosen enum,
 *     so `status=completed` skipped all three while still writing a row that
 *     occupies the `no_teacher_lesson_overlap` range and is immediately
 *     billable via `createLessonCharge`. There is no status gate here: a
 *     lesson recorded after the fact still collides with a real diary.
 *
 * Not a `'use server'` module — it is called by actions that have already
 * resolved the org and role from the session.
 */

import { getTranslations } from 'next-intl/server'
import { buildAvailabilityNotice, type AvailabilityNotice } from '@/lib/availability/availabilityNotice'
import {
  checkLessonCalendarConflicts,
  type CalendarConflict,
} from '@/lib/google-calendar/checkLessonCalendarConflicts'
import { analyzeScheduleImpact, type ScheduleImpact } from '@/lib/scheduling/scheduleImpact'
import {
  issueScheduleAck,
  verifyScheduleAck,
  type ScheduleAckKind,
  type ScheduleAckSlot,
} from './scheduleAck'

export type { AvailabilityNotice, CalendarConflict, ScheduleImpact }

/** What a lesson-creation action hands back to its form. */
export type NewLessonState = {
  error: string | null
  success?: boolean
  /**
   * Set when the requested slot is outside the teacher's availability windows.
   * The UI surfaces a confirmation dialog; resubmitting with the returned
   * `scheduleAck` waives it.
   */
  needsAvailabilityConfirm?: boolean
  /**
   * What the teacher's availability actually says for that day, so the
   * confirmation dialog can show it instead of a bare "not available".
   */
  availabilityInfo?: AvailabilityNotice
  /** Set when a Google Calendar event overlaps the requested slot. */
  needsCalendarConfirm?: boolean
  calendarConflicts?: CalendarConflict[]
  /**
   * Google answered neither "free" nor "busy" — a revoked token, a 403, an
   * outage or the 8s timeout. Silence used to be rendered as "no conflicts".
   */
  calendarCheckFailed?: boolean
  /** The lesson is legal, but would strand time too short for another lesson. */
  needsScheduleImpactConfirm?: boolean
  scheduleImpact?: ScheduleImpact
  /**
   * Server-signed proof that the warnings above were actually shown, for this
   * exact slot. The form posts it back as `schedule_ack`; it is the ONLY thing
   * that waives a guard, and a client cannot mint one.
   */
  scheduleAck?: string
}

type GuardArgs = {
  orgId: string
  teacherId: string
  date: string
  startTime: string
  durationMinutes: number
}

/**
 * The availability conflict, or null when the slot fits. The wording and the
 * "here is what your availability actually says" payload live in
 * `buildAvailabilityNotice`, shared with the teacher's own route.
 */
async function assertWithinTeacherAvailability(
  params: GuardArgs & { role: string }
): Promise<NewLessonState | null> {
  const built = await buildAvailabilityNotice(params)
  if (!built) return null
  return {
    error: built.message,
    needsAvailabilityConfirm: true,
    availabilityInfo: built.notice,
  }
}

/** The stranded-gap warning, or null. */
async function assertCompactSchedule(
  params: GuardArgs & { audience: 'teacher' | 'admin' }
): Promise<NewLessonState | null> {
  const impact = await analyzeScheduleImpact(params)
  if (!impact) return null
  const t = await getTranslations()
  return {
    error: t('lessons.scheduleImpact.description'),
    needsScheduleImpactConfirm: true,
    scheduleImpact: impact,
  }
}

/** Google Calendar conflicts, or null when clear (or no calendar connected). */
async function assertNoCalendarConflicts(params: GuardArgs): Promise<NewLessonState | null> {
  const t = await getTranslations()
  const { conflicts, status } = await checkLessonCalendarConflicts(params)

  // Not free, not busy: we could not read the calendar. Staff may still book —
  // it is their own diary and they can see it — but they say so explicitly
  // rather than being shown a silence that looks like a clean check.
  if (status === 'unknown_provider_error') {
    return {
      error: t('lessons.conflicts.googleCalendarUnavailable'),
      needsCalendarConfirm: true,
      calendarCheckFailed: true,
      calendarConflicts: conflicts,
    }
  }

  if (conflicts.length === 0) return null
  return {
    error: t('lessons.conflicts.googleCalendar'),
    needsCalendarConfirm: true,
    calendarConflicts: conflicts,
  }
}

/**
 * Runs whichever of the three guards this request has not already, verifiably,
 * acknowledged. Returns null to proceed, or the state to render — carrying a
 * fresh token that waives exactly the guards that fired plus the ones already
 * answered, so the second dialog does not re-open the first.
 *
 * Every guard that fires is collected before returning, so ONE round trip
 * carries every warning. The old shape returned the first, took an ack for it,
 * then surprised the user with the next.
 */
export async function runScheduleGuards(params: {
  slot: ScheduleAckSlot
  role: string
  audience: 'teacher' | 'admin'
  ackToken: string | null
}): Promise<NewLessonState | null> {
  const { slot, role, audience, ackToken } = params
  const acknowledged = verifyScheduleAck(ackToken, slot)

  const args: GuardArgs = {
    orgId: slot.orgId,
    teacherId: slot.teacherId,
    date: slot.date,
    startTime: slot.startTime,
    durationMinutes: slot.durationMinutes,
  }

  const raised: ScheduleAckKind[] = []
  let state: NewLessonState | null = null

  const merge = (next: NewLessonState | null, kind: ScheduleAckKind) => {
    if (!next) return
    raised.push(kind)
    // The FIRST warning's message is the headline; the rest ride along as
    // flags so the dialog can show everything at once.
    state = state ? { ...state, ...next, error: state.error } : next
  }

  if (!acknowledged.has('availability')) {
    merge(await assertWithinTeacherAvailability({ ...args, role }), 'availability')
  }
  if (!acknowledged.has('schedule_impact')) {
    merge(await assertCompactSchedule({ ...args, audience }), 'schedule_impact')
  }
  if (!acknowledged.has('calendar')) {
    merge(await assertNoCalendarConflicts(args), 'calendar')
  }

  if (!state) return null

  const kinds = [...new Set<ScheduleAckKind>([...raised, ...acknowledged])]
  return { ...(state as NewLessonState), scheduleAck: issueScheduleAck(slot, kinds) }
}
