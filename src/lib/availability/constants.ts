/**
 * Day-of-week keys indexed by the JS convention (0 = Sunday), matching the
 * `common.days.*` catalog entries. Render with `t('common.days.' + DAY_KEYS[i])`
 * rather than storing day names here — the availability grid is shown in the
 * viewer's language.
 */
export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type DayKey = (typeof DAY_KEYS)[number]

/**
 * Normalize a Postgres `time` ("HH:MM:SS") to "HH:MM".
 *
 * Lives here rather than in ./index because both the client-side grid and
 * `checkTeacherAvailability` need it, and ./index imports the Supabase server
 * client — which drags `next/headers` in and cannot be loaded from either.
 */
export function normalizeTime(t: string): string {
  return t.substring(0, 5)
}

export interface TimeRange {
  /** HH:MM, org-local wall clock */
  start: string
  end: string
}

/**
 * Remove every blocked range from a set of open windows.
 *
 * These are weekly wall-clock rules, not instants: "the morning is closed"
 * means 08:00–12:00 on that date whatever the offset happens to be. Comparing
 * the "HH:MM" strings directly is what keeps that true — routing them through
 * Date or Luxon would shift a block across a DST boundary.
 *
 * A block that lands in the middle of a window splits it in two, which is why
 * this returns a list rather than mutating in place.
 */
export function subtractRanges(base: TimeRange[], blocks: TimeRange[]): TimeRange[] {
  let open = base
    .filter((w) => w.start < w.end)
    .map((w) => ({ start: normalizeTime(w.start), end: normalizeTime(w.end) }))

  for (const raw of blocks) {
    const block = { start: normalizeTime(raw.start), end: normalizeTime(raw.end) }
    if (block.start >= block.end) continue

    const next: TimeRange[] = []
    for (const window of open) {
      // Disjoint — a touching boundary is not an overlap, matching hasOverlap.
      if (block.end <= window.start || block.start >= window.end) {
        next.push(window)
        continue
      }
      if (block.start > window.start) next.push({ start: window.start, end: block.start })
      if (block.end < window.end) next.push({ start: block.end, end: window.end })
    }
    open = next
  }

  return open.sort((a, b) => a.start.localeCompare(b.start))
}
