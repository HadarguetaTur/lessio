/**
 * High-level helper: fetches calendar tokens for the org and teacher,
 * builds UTC ISO timestamps from the lesson date/time/duration,
 * and returns any Google Calendar conflicts.
 *
 * Used by lesson creation actions (dashboard and teacher sub-shell).
 *
 * Never throws — a Google failure must not block a staff member from booking a
 * lesson — but it reports that failure rather than returning a clean empty
 * list. Staff may still proceed; they now do it knowingly, by acknowledging a
 * dialog that says the calendar could not be read, instead of being told
 * nothing at all.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  checkCalendarConflicts,
  resolveSelectedCalendars,
  usableCalendarToken,
  CalendarConflict,
  type CalendarCheckStatus,
} from './index'
import { markCalendarConnectionsRevoked } from './markNeedsReauth'

export type { CalendarConflict, CalendarCheckStatus }

export interface LessonCalendarCheck {
  conflicts: CalendarConflict[]
  status: CalendarCheckStatus
}

export async function checkLessonCalendarConflicts(params: {
  orgId:           string
  teacherId:       string  // teacher_profiles.id (UUID)
  date:            string  // YYYY-MM-DD
  startTime:       string  // HH:MM
  durationMinutes: number
}): Promise<LessonCalendarCheck> {
  const { orgId, teacherId, date, startTime, durationMinutes } = params

  const db = createServiceRoleClient()

  // Fetch org calendar token + timezone + calendar selection in one query
  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('google_calendar_refresh_token, google_calendar_selected_calendars, google_calendar_needs_reauth_at, timezone')
    .eq('id', orgId)
    .maybeSingle()

  // Fetch teacher's calendar token + calendar selection
  const { data: teacher, error: teacherError } = await db
    .from('teachers')
    .select('google_calendar_refresh_token, google_calendar_selected_calendars, google_calendar_needs_reauth_at')
    .eq('id', teacherId)
    .maybeSingle()

  // supabase-js returns `{ error }` rather than throwing. Ignoring it turned a
  // DB blip on the token lookup into a confident 'free', which is exactly the
  // lie this module's tri-state was introduced to stop telling.
  if (orgError || teacherError) {
    console.error('[google-calendar] Could not read the calendar tokens', {
      orgId,
      teacherId,
      orgError,
      teacherError,
    })
    return { conflicts: [], status: 'unknown_provider_error' }
  }

  // A level flagged `needs_reauth` reads as disconnected: Google already refused
  // its token, and asking again would only raise the "could not read your
  // calendar" dialog on every lesson. The settings page carries the reconnect
  // prompt instead.
  const orgToken     = usableCalendarToken(org)
  const teacherToken = usableCalendarToken(teacher)

  // Skip entirely if neither calendar is connected. Nothing to ask is free,
  // not unknown — this org has opted out of the check altogether.
  if (!orgToken && !teacherToken) return { conflicts: [], status: 'free' }

  const timezone = org?.timezone ?? 'Asia/Jerusalem'

  const lessonStart = DateTime.fromFormat(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm', { zone: timezone })
  // A date that passes the action's `^\d{4}-\d{2}-\d{2}$` but is not a real day
  // ('2027-02-31'). We did not ask Google, so we do not know — reporting 'free'
  // here is the same category error as swallowing the DB error above.
  if (!lessonStart.isValid) return { conflicts: [], status: 'unknown_provider_error' }

  const lessonEnd = lessonStart.plus({ minutes: durationMinutes })
  const timeMin   = lessonStart.toUTC().toISO()!
  const timeMax   = lessonEnd.toUTC().toISO()!

  const result = await checkCalendarConflicts({
    orgEncryptedToken:        orgToken,
    teacherEncryptedToken:    teacherToken,
    orgSelectedCalendars:     resolveSelectedCalendars(org?.google_calendar_selected_calendars),
    teacherSelectedCalendars: resolveSelectedCalendars(teacher?.google_calendar_selected_calendars),
    timeMin,
    timeMax,
  })

  // The first refusal still surfaces as unknown_provider_error (the staff
  // dialog says the connection expired and links to reconnect); from the next
  // lesson on the level is skipped above.
  markCalendarConnectionsRevoked({ orgId, teacherId, revoked: result.revoked })

  return { conflicts: result.conflicts, status: result.status }
}
