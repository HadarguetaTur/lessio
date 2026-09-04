/**
 * High-level helper: fetches calendar tokens for the org and teacher,
 * builds UTC ISO timestamps from the lesson date/time/duration,
 * and returns any Google Calendar conflicts.
 *
 * Used by lesson creation actions (dashboard and teacher sub-shell).
 * Never throws — errors in the Google API are swallowed and treated as no-conflict
 * so a transient failure never blocks lesson creation.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkCalendarConflicts, resolveSelectedCalendars, CalendarConflict } from './index'

export type { CalendarConflict }

export async function checkLessonCalendarConflicts(params: {
  orgId:           string
  teacherId:       string  // teacher_profiles.id (UUID)
  date:            string  // YYYY-MM-DD
  startTime:       string  // HH:MM
  durationMinutes: number
}): Promise<CalendarConflict[]> {
  const { orgId, teacherId, date, startTime, durationMinutes } = params

  const db = createServiceRoleClient()

  // Fetch org calendar token + timezone + calendar selection in one query
  const { data: org } = await db
    .from('organizations')
    .select('google_calendar_refresh_token, google_calendar_selected_calendars, timezone')
    .eq('id', orgId)
    .maybeSingle()

  // Fetch teacher's calendar token + calendar selection
  const { data: teacher } = await db
    .from('teachers')
    .select('google_calendar_refresh_token, google_calendar_selected_calendars')
    .eq('id', teacherId)
    .maybeSingle()

  const orgToken     = org?.google_calendar_refresh_token ?? null
  const teacherToken = teacher?.google_calendar_refresh_token ?? null

  // Skip entirely if neither calendar is connected
  if (!orgToken && !teacherToken) return []

  const timezone = org?.timezone ?? 'Asia/Jerusalem'

  const lessonStart = DateTime.fromFormat(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm', { zone: timezone })
  if (!lessonStart.isValid) return []

  const lessonEnd = lessonStart.plus({ minutes: durationMinutes })
  const timeMin   = lessonStart.toUTC().toISO()!
  const timeMax   = lessonEnd.toUTC().toISO()!

  return checkCalendarConflicts({
    orgEncryptedToken:        orgToken,
    teacherEncryptedToken:    teacherToken,
    orgSelectedCalendars:     resolveSelectedCalendars(org?.google_calendar_selected_calendars),
    teacherSelectedCalendars: resolveSelectedCalendars(teacher?.google_calendar_selected_calendars),
    timeMin,
    timeMax,
  })
}
