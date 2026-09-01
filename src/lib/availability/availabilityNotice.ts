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
 *
 * It answers two independent questions: does the slot fall inside the
 * teacher's hours, and does it leave them the break they asked for. A slot can
 * pass the first and fail the second, so neither short-circuits the other.
 * Both stay advisory: a teacher scheduling by hand may book back-to-back.
 */

import { getTranslations } from 'next-intl/server'
import {
  checkTeacherAvailability,
  type AvailabilityWindowTimes,
} from './checkTeacherAvailability'
import { checkBreakConflict, type BreakConflict } from '@/lib/scheduling/checkBreakConflict'

export interface AvailabilityNotice {
  /** 0=Sun…6=Sat in org timezone; null when the date could not be resolved. */
  dayOfWeek: number | null
  windows: AvailabilityWindowTimes[]
  source: 'weekly' | 'override'
  /** Only set for an override — the reason the teacher typed. */
  reason: string | null
  /** Where this reader can edit the windows they just collided with. */
  editHref: string
  /**
   * Set when the lesson fits the teacher's hours but not their break. Carried
   * alongside rather than as a status, because it is an independent question:
   * a slot can be inside the window and still leave no gap.
   */
  breakConflict?: BreakConflict
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
  /** Set when editing, so the lesson is not judged against itself. */
  excludeLessonId?: string
}): Promise<{ message: string; notice: AvailabilityNotice } | null> {
  const { orgId, teacherId, date, startTime, durationMinutes, role, excludeLessonId } = params
  const t = await getTranslations()

  const [result, breakConflict] = await Promise.all([
    checkTeacherAvailability({ orgId, teacherId, date, startTime, durationMinutes }),
    checkBreakConflict({ orgId, teacherId, date, startTime, durationMinutes, excludeLessonId }),
  ])

  const editHref = editHrefFor(role, teacherId)

  // The two checks are independent, so a slot inside the teacher's hours can
  // still owe them a break. Reporting only the availability result — which is
  // what returning early here used to do — would have let that pass silently.
  const availabilityFailed = result.status !== 'inside' && result.status !== 'no_windows'

  if (!availabilityFailed) {
    if (!breakConflict) return null

    return {
      message: t('lessons.conflicts.breakTooShort', {
        minutes: breakConflict.requiredMinutes,
      }),
      notice: {
        dayOfWeek: 'dayOfWeek' in result ? result.dayOfWeek : null,
        windows: 'windows' in result ? result.windows : [],
        source: 'source' in result ? result.source : 'weekly',
        reason: null,
        editHref,
        breakConflict,
      },
    }
  }

  const messages: Record<'outside_windows' | 'override_unavailable' | 'partial_override', string> = {
    outside_windows: t('lessons.conflicts.outsideWindows'),
    override_unavailable: t('lessons.conflicts.markedUnavailable'),
    partial_override: t('lessons.conflicts.outsideDayWindow'),
  }

  return {
    message: messages[result.status as keyof typeof messages],
    notice: {
      dayOfWeek: result.dayOfWeek,
      windows: result.windows,
      source: result.source,
      reason: 'reason' in result ? result.reason : null,
      editHref,
      ...(breakConflict ? { breakConflict } : {}),
    },
  }
}
