/**
 * Leftover time at the end of a teacher's day.
 *
 * The slot generator stops as soon as a whole lesson no longer fits, so a
 * 16:00–19:30 day booked with hour-long lessons silently discards 19:00–19:30.
 * Nobody was ever told those minutes existed — they were neither bookable nor
 * visibly closed. This detects that remainder after a lesson is written and
 * turns it into a decision for the teacher: block it, extend the day, or leave
 * it alone.
 *
 * Only the LAST window of the day is considered, which is what "end of the day"
 * means and what makes "extend" a coherent offer — stretching a morning window
 * would run into the evening one. Gaps in the middle of a day are out of scope.
 *
 * Everything here is best-effort: `detectDayTail` never throws, because it runs
 * after a lesson has already been created and must not turn a successful
 * booking into an error.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveDayWindows } from '@/lib/availability/resolveDayWindows'
import { getOrgLessonDurations } from '@/lib/organizations/lessonDurations'
import { createNotification, getTeacherProfileId } from '@/lib/notifications'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { resolveBreakMinutes } from './breaks'

export interface DayTail {
  /** HH:MM in org timezone */
  start: string
  end: string
  minutes: number
}

/** Minutes between two "HH:MM" wall-clock strings on the same day. */
function minutesBetween(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  return th * 60 + tm - (fh * 60 + fm)
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const capped = Math.min(total, 23 * 60 + 59)
  return `${String(Math.floor(capped / 60)).padStart(2, '0')}:${String(capped % 60).padStart(2, '0')}`
}

/**
 * The unbookable remainder at the end of this teacher's day, or null.
 *
 * "Unbookable" is measured against the shortest duration the bot may offer:
 * anything at least that long is still a slot a parent can take, so there is
 * nothing to ask about.
 */
export async function findDayTail(params: {
  orgId: string
  teacherId: string
  /** YYYY-MM-DD in org timezone */
  date: string
}): Promise<DayTail | null> {
  const { orgId, teacherId, date } = params
  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('timezone, break_duration_minutes, tail_prompt_enabled')
    .eq('id', orgId)
    .single()
  if (!org) return null
  if (org.tail_prompt_enabled === false) return null

  const timezone = (org.timezone as string) ?? 'Asia/Jerusalem'

  // A closed date has no end-of-day to speak of.
  const { data: holiday } = await db
    .from('organization_holidays')
    .select('id')
    .eq('organization_id', orgId)
    .eq('date', date)
    .limit(1)
    .maybeSingle()
  if (holiday) return null

  const day = await resolveDayWindows({ orgId, teacherId, date, timezone })
  if (day.fullDayBlocked || day.windows.length === 0) return null

  const lastWindow = day.windows[day.windows.length - 1]

  const { data: teacherRow } = await db
    .from('teachers')
    .select('break_duration_minutes')
    .eq('id', teacherId)
    .eq('organization_id', orgId)
    .maybeSingle()

  const breakMinutes = resolveBreakMinutes(
    (org.break_duration_minutes as number | null) ?? 0,
    (teacherRow?.break_duration_minutes as number | null) ?? null
  )

  // Lessons on this date, as org-local wall clock so they compare with windows.
  const localDate = DateTime.fromISO(date, { zone: timezone })
  const { data: lessons } = await db
    .from('lessons')
    .select('end_at')
    .eq('organization_id', orgId)
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .gte('start_at', localDate.startOf('day').toUTC().toISO()!)
    .lte('start_at', localDate.endOf('day').toUTC().toISO()!)

  const endsInLastWindow = (lessons ?? [])
    .map((l) => DateTime.fromISO(l.end_at as string, { zone: 'utc' }).setZone(timezone).toFormat('HH:mm'))
    .filter((end) => end > lastWindow.start && end <= lastWindow.end)

  // An empty final window is simply a free evening, not a leftover.
  if (endsInLastWindow.length === 0) return null

  const lastBusyEnd = endsInLastWindow.reduce((a, b) => (a > b ? a : b))
  const tailStart = addMinutes(lastBusyEnd, breakMinutes)
  if (tailStart >= lastWindow.end) return null

  const minutes = minutesBetween(tailStart, lastWindow.end)
  if (minutes <= 0) return null

  const durations = await getOrgLessonDurations(orgId, 'bot')
  if (durations.length === 0) return null
  const shortestBookable = Math.min(...durations.map((d) => d.minutes))

  // Still long enough to sell — nothing to decide.
  if (minutes >= shortestBookable) return null

  return { start: tailStart, end: lastWindow.end, minutes }
}

/**
 * Records the tail and tells the teacher about it.
 *
 * Called after a lesson is written, so it swallows everything: a failure here
 * must never surface as a failed booking.
 *
 * Deduped on (teacher, date) by a unique constraint. A second booking on the
 * same day updates the stored remainder silently rather than sending a second
 * notification, and a row the teacher has already resolved is left alone.
 */
export async function detectDayTail(params: {
  organizationId: string
  teacherId: string
  /** The new lesson's start, UTC ISO. The org-local date is derived from it. */
  startAtUtc: string
}): Promise<void> {
  const { organizationId: orgId, teacherId, startAtUtc } = params

  try {
    const db = createServiceRoleClient()

    // Callers hold an instant, not a date. Which day that instant belongs to is
    // a question only the org timezone can answer, so it is answered here
    // rather than at each call site.
    const { data: org } = await db
      .from('organizations')
      .select('timezone')
      .eq('id', orgId)
      .single()
    if (!org) return

    const date = DateTime.fromISO(startAtUtc, { zone: 'utc' })
      .setZone((org.timezone as string) ?? 'Asia/Jerusalem')
      .toISODate()
    if (!date) return

    const tail = await findDayTail({ orgId, teacherId, date })

    if (!tail) {
      // The remainder is gone or usable again (a lesson moved, the day was
      // extended). Retract an unanswered prompt rather than leaving a question
      // about time that is no longer stranded.
      await db
        .from('availability_tail_prompts')
        .delete()
        .eq('teacher_id', teacherId)
        .eq('tail_date', date)
        .eq('status', 'pending')
      return
    }

    const { error } = await db.from('availability_tail_prompts').insert({
      organization_id: orgId,
      teacher_id: teacherId,
      tail_date: date,
      tail_start: tail.start,
      tail_end: tail.end,
      tail_minutes: tail.minutes,
      status: 'pending',
    })

    if (error) {
      // 23505 = the unique (teacher_id, tail_date). Either the teacher has
      // already been asked, or they have already answered.
      if (error.code !== '23505') {
        console.error('[dayTail] Could not record the prompt', {
          orgId,
          teacherId,
          date,
          error: error.message,
        })
        return
      }

      await db
        .from('availability_tail_prompts')
        .update({
          tail_start: tail.start,
          tail_end: tail.end,
          tail_minutes: tail.minutes,
          updated_at: new Date().toISOString(),
        })
        .eq('teacher_id', teacherId)
        .eq('tail_date', date)
        .eq('status', 'pending')
      return
    }

    const profileId = await getTeacherProfileId(teacherId)
    if (!profileId) return

    const { data: orgRow } = await db
      .from('organizations')
      .select('default_locale, timezone')
      .eq('id', orgId)
      .maybeSingle()

    const locale = parseAppLocale(orgRow?.default_locale ?? undefined)
    const tn = await getT('notifications', locale)
    const timezone = (orgRow?.timezone as string) ?? 'Asia/Jerusalem'
    const dateLabel = DateTime.fromISO(date, { zone: timezone }).toFormat('dd/MM/yyyy')

    await createNotification({
      orgId,
      recipientProfileId: profileId,
      type: 'availability_tail',
      title: tn('availabilityTail', { minutes: tail.minutes }),
      body: tn('availabilityTailBody', {
        date: dateLabel,
        start: tail.start,
        end: tail.end,
      }),
      actionUrl: '/teacher/availability',
    })
  } catch (err) {
    console.error('[dayTail] Detection failed', { orgId, teacherId, startAtUtc, err })
  }
}
