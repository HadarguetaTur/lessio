/**
 * The "teacher is not available at this time" notice shown before a lesson is
 * persisted.
 *
 * Deliberately NOT inside `lessons/new/actions.ts`: every export of a
 * `'use server'` module is published as a callable RPC endpoint, and this is a
 * helper, not an action. Living here also lets the teacher's own new-lesson
 * route reuse it.
 *
 * The check stays advisory — `no_windows` returns null so an org that skipped
 * the availability step during onboarding is never blocked. What changed is
 * that a real conflict now carries the windows it conflicted with, plus the
 * route where the reader can fix them.
 */

import { getTranslations } from 'next-intl/server'
import {
  checkTeacherAvailability,
  type AvailabilityWindowTimes,
} from './checkTeacherAvailability'

export interface AvailabilityNotice {
  /** 0=Sun…6=Sat in org timezone; null when the date could not be resolved. */
  dayOfWeek: number | null
  windows: AvailabilityWindowTimes[]
  source: 'weekly' | 'override'
  /** Only set for an override — the reason the teacher typed. */
  reason: string | null
  /** Where this reader can edit the windows they just collided with. */
  editHref: string
}

/**
 * Resolved server-side so the client never guesses a route it may not open.
 * A teacher edits their own grid through the session-scoped route; an
 * owner/admin gets the per-teacher page, which is correct whether or not the
 * teacher in question is themselves.
 */
function editHrefFor(role: string, teacherId: string): string {
  if (role === 'teacher') return '/teacher/availability'
  return `/teachers/${teacherId}/availability`
}

export async function buildAvailabilityNotice(params: {
  orgId: string
  teacherId: string
  date: string
  startTime: string
  durationMinutes: number
  role: string
}): Promise<{ message: string; notice: AvailabilityNotice } | null> {
  const { orgId, teacherId, date, startTime, durationMinutes, role } = params
  const t = await getTranslations()

  const result = await checkTeacherAvailability({
    orgId,
    teacherId,
    date,
    startTime,
    durationMinutes,
  })

  if (result.status === 'inside') return null
  if (result.status === 'no_windows') return null

  const messages: Record<'outside_windows' | 'override_unavailable' | 'partial_override', string> = {
    outside_windows: t('lessons.conflicts.outsideWindows'),
    override_unavailable: t('lessons.conflicts.markedUnavailable'),
    partial_override: t('lessons.conflicts.outsideDayWindow'),
  }

  return {
    message: messages[result.status],
    notice: {
      dayOfWeek: result.dayOfWeek,
      windows: result.windows,
      source: result.source,
      reason: 'reason' in result ? result.reason : null,
      editHref: editHrefFor(role, teacherId),
    },
  }
}
