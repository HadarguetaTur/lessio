/**
 * getExternalBusyIntervals — Google Calendar busy time for the PARENT-FACING
 * booking surfaces (decision #36).
 *
 * Semantics: the org's connected calendar is an org-wide blackout applied to
 * every teacher (studio closed, staff meeting); the teacher's connected
 * calendar is their personal busy time. Effective busy is the union of both.
 * Here that union is HARD — a busy slot is never offered and never locked —
 * unlike the dashboard, where staff get a soft-confirm dialog they may
 * override.
 *
 * A Google failure is reported, not hidden. `getExternalBusy` carries the
 * tri-state through so each surface can pick its own rule:
 *
 *   - listing (getAvailableSlots, getAvailabilitySummary) stays fail-open. The
 *     rendered list is advisory, and an outage must not close the booking book.
 *   - the write path (createSlotLock) fails closed. Commit-time validation is
 *     authoritative, and "we could not ask Google" is not "the teacher is
 *     free"; the parent gets an honest retry instead of a double-booking.
 *
 * `getExternalBusyIntervals` is the advisory shorthand — it drops the status on
 * purpose, at a call site that has already decided to fail open.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  checkCalendarConflicts,
  resolveSelectedCalendars,
  usableCalendarToken,
  type CalendarCheckStatus,
} from './index'
import { markCalendarConnectionsRevoked } from './markNeedsReauth'

export interface ExternalBusyInterval {
  start: string // UTC ISO
  end:   string // UTC ISO
}

export interface ExternalBusyResult {
  intervals: ExternalBusyInterval[]
  status: CalendarCheckStatus
}

/** Sorts and coalesces overlapping or touching intervals. Exported for tests. */
export function mergeBusyIntervals(
  intervals: { start: string; end: string }[]
): ExternalBusyInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start))
  const merged: ExternalBusyInterval[] = []

  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end
      continue
    }
    merged.push({ start: interval.start, end: interval.end })
  }

  return merged
}

export async function getExternalBusy(params: {
  orgId:          string
  teacherId:      string // teachers.id
  windowStartUtc: string // UTC ISO
  windowEndUtc:   string // UTC ISO
}): Promise<ExternalBusyResult> {
  const { orgId, teacherId, windowStartUtc, windowEndUtc } = params

  const db = createServiceRoleClient()

  const [{ data: org, error: orgError }, { data: teacher, error: teacherError }] =
    await Promise.all([
      db
        .from('organizations')
        .select('google_calendar_refresh_token, google_calendar_selected_calendars, google_calendar_needs_reauth_at')
        .eq('id', orgId)
        .maybeSingle(),
      db
        .from('teachers')
        .select('google_calendar_refresh_token, google_calendar_selected_calendars, google_calendar_needs_reauth_at')
        .eq('id', teacherId)
        .maybeSingle(),
    ])

  // supabase-js RETURNS `{ error }`; it does not throw. Discarding it here made
  // a transient PostgREST or network failure on the TOKEN LOOKUP indistinguish-
  // able from "no calendar connected", so the function returned a hard 'free'
  // and `createSlotLock`'s fail-closed branch could never fire — the parent
  // booked straight over the teacher's real diary. The whole tri-state exists
  // to say "we could not ask Google", and this is one of the ways we cannot.
  if (orgError || teacherError) {
    console.error('[google-calendar] Could not read the calendar tokens', {
      orgId,
      teacherId,
      orgError,
      teacherError,
    })
    return { intervals: [], status: 'unknown_provider_error' }
  }

  // A level Google has already refused (`needs_reauth_at` set) is treated as
  // disconnected here too — deliberately. Failing every parent booking closed
  // until the owner notices would turn a stale token into a shut booking book;
  // the dead connection is visible on the settings page and connections hub,
  // and reconnecting restores the blackout.
  const orgToken     = usableCalendarToken(org)
  const teacherToken = usableCalendarToken(teacher)

  // The common case — no calendar connected — costs zero Google traffic, and
  // "nothing to ask" is genuinely free rather than unknown. Reachable only now
  // that a failed read is ruled out above.
  if (!orgToken && !teacherToken) return { intervals: [], status: 'free' }

  const result = await checkCalendarConflicts({
    orgEncryptedToken:        orgToken,
    teacherEncryptedToken:    teacherToken,
    orgSelectedCalendars:     resolveSelectedCalendars(org?.google_calendar_selected_calendars),
    teacherSelectedCalendars: resolveSelectedCalendars(teacher?.google_calendar_selected_calendars),
    timeMin:                  windowStartUtc,
    timeMax:                  windowEndUtc,
  })

  markCalendarConnectionsRevoked({ orgId, teacherId, revoked: result.revoked })

  return {
    intervals: mergeBusyIntervals(result.conflicts.map(c => ({ start: c.start, end: c.end }))),
    status: result.status,
  }
}

/**
 * Busy intervals only, for the two listing surfaces that have already decided
 * to fail open. Anything on a write path must call `getExternalBusy` and
 * handle `unknown_provider_error` itself.
 */
export async function getExternalBusyIntervals(params: {
  orgId:          string
  teacherId:      string
  windowStartUtc: string
  windowEndUtc:   string
}): Promise<ExternalBusyInterval[]> {
  const { intervals } = await getExternalBusy(params)
  return intervals
}
