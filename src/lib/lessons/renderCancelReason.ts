/**
 * `lessons.cancel_reason` is written once and read much later, possibly by
 * someone working in a different language, so the reasons the system generates
 * are stored as stable codes and resolved at render time.
 *
 * Anything unrecognised is passed through untouched: reasons typed by a user,
 * and rows written before these became codes.
 */

const CODES: Record<string, string> = {
  SERIES_CANCELLED: 'lessons.cancelReasons.series',
  CANCELLED_VIA_WHATSAPP: 'lessons.cancelReasons.whatsapp',
  TEACHER_DAY_OFF: 'lessons.cancelReasons.teacherDayOff',
}

export function renderCancelReason(
  reason: string | null | undefined,
  t: (key: string) => string
): string | null {
  if (!reason) return null
  const key = CODES[reason]
  return key ? t(key) : reason
}

/**
 * Written to `lessons.cancel_reason` by cancelLessonSeries. It lives here rather
 * than in cancelSeries.ts because that module is `'use server'`, and such a
 * module may only export async functions — exporting a const from it silently
 * strips every export, which only the build catches, not tsc.
 */
export const SERIES_CANCEL_REASON = 'SERIES_CANCELLED'
