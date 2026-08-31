/** Query param that reveals cancelled lessons the calendar hides by default. */
export const CANCELLED_PARAM = 'cancelled'
export const CANCELLED_ON = '1'

/**
 * Params that must survive every calendar navigation: the student deep-link and the
 * "show cancelled" toggle. Every nav control rebuilds its URL from scratch (so the
 * view-specific date param stays authoritative), so each one has to carry these over.
 */
export function preserveCalendarParams(
  from: { get(name: string): string | null },
  into: URLSearchParams
): URLSearchParams {
  for (const key of ['student', CANCELLED_PARAM]) {
    const value = from.get(key)
    if (value) into.set(key, value)
  }
  return into
}
