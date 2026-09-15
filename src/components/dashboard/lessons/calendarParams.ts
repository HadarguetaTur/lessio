/** Query param that reveals cancelled lessons the calendar hides by default. */
export const CANCELLED_PARAM = 'cancelled'
export const CANCELLED_ON = '1'

/** Query param that narrows the admin calendar to one teacher. */
export const TEACHER_PARAM = 'teacher'

/** A visual preference only: the compact weekly schedule fits more lessons per day. */
export const CALENDAR_DENSITY_PARAM = 'density'
export const CALENDAR_DENSITY_COMPACT = 'compact'

/**
 * Params that must survive every calendar navigation: the student deep-link and the
 * "show cancelled" toggle. Every nav control rebuilds its URL from scratch (so the
 * view-specific date param stays authoritative), so each one has to carry these over.
 */
export function preserveCalendarParams(
  from: { get(name: string): string | null },
  into: URLSearchParams
): URLSearchParams {
  for (const key of ['student', CANCELLED_PARAM, CALENDAR_DENSITY_PARAM]) {
    const value = from.get(key)
    if (value) into.set(key, value)
  }
  return into
}

/**
 * The current calendar URL with only the teacher filter changed.
 *
 * Unlike the date controls, switching teacher must not move the user: the view,
 * the week/day/month being looked at, the student deep-link and the cancelled
 * toggle all stay exactly as they are. `null` clears the filter.
 */
export function withTeacherParam(
  current: { toString(): string },
  teacherId: string | null,
  basePath = '/lessons'
): string {
  const params = new URLSearchParams(current.toString())
  if (teacherId) params.set(TEACHER_PARAM, teacherId)
  else params.delete(TEACHER_PARAM)
  const q = params.toString()
  return q ? `${basePath}?${q}` : basePath
}
