import type { Lesson } from '@/lib/lessons/types'
import { SERIES_CANCEL_REASON } from '@/lib/lessons/renderCancelReason'

export interface CalendarLessonsResult {
  /** Lessons the calendar should render. */
  visible: Lesson[]
  /** How many lessons the default (collapsed) calendar hides — drives the toggle's counter. */
  hiddenCount: number
}

/**
 * A lesson is calendar noise when it is cancelled and its time has not arrived yet.
 *
 * The calendar shows what is going to happen; the past is a record. A cancelled lesson
 * still ahead of us is an absence, not an event — and the rest of the system already
 * agrees: conflict checks (createLesson, createSeries) and getAvailableSlots all treat
 * a cancelled slot as free. Rendering it fills a slot that is actually bookable.
 *
 * Cancelled lessons in the past stay visible: they happened, and they may carry a
 * cancellation charge someone needs to explain.
 *
 * A row a series-wide cancel wrote is the exception, at any date. That reason is
 * only ever written in bulk, over lessons nobody attended and nobody was charged
 * for, which is why the 20260901100000 migration deleted the future ones outright
 * as "planning noise, not cancellation history". The past ones it could not safely
 * delete are the same noise, so the calendar hides them too — the toggle still
 * brings them back.
 */
function isHiddenFromCalendar(lesson: Lesson, nowMs: number): boolean {
  if (lesson.status !== 'cancelled') return false
  if (lesson.cancel_reason === SERIES_CANCEL_REASON) return true
  return new Date(lesson.start_at).getTime() >= nowMs
}

/**
 * Splits calendar lessons into what to render and how many were suppressed.
 * `hiddenCount` is reported even when `includeCancelled` is true, so the toggle can
 * keep showing what it is revealing.
 */
export function filterCalendarLessons(
  lessons: Lesson[],
  opts: { includeCancelled: boolean; now?: Date }
): CalendarLessonsResult {
  const nowMs = (opts.now ?? new Date()).getTime()
  const hiddenCount = lessons.filter((l) => isHiddenFromCalendar(l, nowMs)).length

  return {
    visible: opts.includeCancelled
      ? lessons
      : lessons.filter((l) => !isHiddenFromCalendar(l, nowMs)),
    hiddenCount,
  }
}
