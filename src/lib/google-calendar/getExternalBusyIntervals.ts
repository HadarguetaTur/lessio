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
 * Fail-open: a Google API failure reads as "no busy" (checkCalendarConflicts
 * already swallows and logs per level). A Google outage must not close the
 * booking book; lesson-vs-lesson integrity is still protected by the DB
 * exclusion constraint.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkCalendarConflicts, resolveSelectedCalendars } from './index'

export interface ExternalBusyInterval {
  start: string // UTC ISO
  end:   string // UTC ISO
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

export async function getExternalBusyIntervals(params: {
  orgId:          string
  teacherId:      string // teachers.id
  windowStartUtc: string // UTC ISO
  windowEndUtc:   string // UTC ISO
}): Promise<ExternalBusyInterval[]> {
  const { orgId, teacherId, windowStartUtc, windowEndUtc } = params

  const db = createServiceRoleClient()

  const [{ data: org }, { data: teacher }] = await Promise.all([
    db
      .from('organizations')
      .select('google_calendar_refresh_token, google_calendar_selected_calendars')
      .eq('id', orgId)
      .maybeSingle(),
    db
      .from('teachers')
      .select('google_calendar_refresh_token, google_calendar_selected_calendars')
      .eq('id', teacherId)
      .maybeSingle(),
  ])

  const orgToken     = org?.google_calendar_refresh_token ?? null
  const teacherToken = teacher?.google_calendar_refresh_token ?? null

  // The common case — no calendar connected — costs zero Google traffic.
  if (!orgToken && !teacherToken) return []

  const conflicts = await checkCalendarConflicts({
    orgEncryptedToken:        orgToken,
    teacherEncryptedToken:    teacherToken,
    orgSelectedCalendars:     resolveSelectedCalendars(org?.google_calendar_selected_calendars),
    teacherSelectedCalendars: resolveSelectedCalendars(teacher?.google_calendar_selected_calendars),
    timeMin:                  windowStartUtc,
    timeMax:                  windowEndUtc,
  })

  return mergeBusyIntervals(conflicts.map(c => ({ start: c.start, end: c.end })))
}
