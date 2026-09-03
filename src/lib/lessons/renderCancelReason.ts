/**
 * `lessons.cancel_reason` is written once and read much later, possibly by
 * someone working in a different language, so the reasons the system generates
 * are stored as stable codes and resolved at render time.
 *
 * Anything unrecognised is passed through untouched: reasons typed by a user,
 * and rows written before these became codes.
 */

const CODES: Record<string, string> = {
  SERIES_CANCELLED: 'cancelReasons.series',
  CANCELLED_VIA_WHATSAPP: 'cancelReasons.whatsapp',
  CANCELLED_VIA_PORTAL: 'cancelReasons.portal',
  TEACHER_DAY_OFF: 'cancelReasons.teacherDayOff',
}

/**
 * `t` must be scoped to the `lessons` namespace — the codes above resolve to
 * `cancelReasons.*` inside it. A differently-scoped translator renders every
 * reason as a missing key, which is what both callers did while these values
 * carried a redundant `lessons.` prefix on top of an already-namespaced `t`.
 */
export function renderCancelReason(
  reason: string | null | undefined,
  t: (key: string) => string
): string | null {
  if (!reason) return null
  const key = CODES[reason]
  return key ? t(key) : reason
}

/**
 * Written to `lessons.cancel_reason` by the series-cancel path that predates
 * stopLessonSeries, and still the marker that tells such a row apart from a
 * cancellation someone made by hand. It lives here rather than in
 * cancelSeries.ts because that module is `'use server'`, and such a module may
 * only export async functions — exporting a const from it silently
 * strips every export, which only the build catches, not tsc.
 */
export const SERIES_CANCEL_REASON = 'SERIES_CANCELLED'
