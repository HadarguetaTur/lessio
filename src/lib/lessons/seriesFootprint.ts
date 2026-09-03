/**
 * One definition of "this occurrence left a trace", shared by every code path
 * that removes lessons from a series.
 *
 * Stopping a series and deleting one ask the same question and must not answer
 * it differently: a stop skips the occurrences that left a trace, a delete
 * refuses outright while any of them exist, and the series list greys out the
 * delete action using the very same count.
 *
 * A trace is money (`charges.lesson_id`, an FK with no ON DELETE — it aborts the
 * delete rather than cascading), teaching (`lesson_notes`, which cascades away
 * silently), or a status that says the lesson actually happened or was
 * cancelled by hand.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

import { isRemovableSeriesOccurrence } from './seriesStop'

export type SeriesOccurrence = {
  id: string
  status: string
  cancel_reason: string | null
  start_at: string
}

export type SeriesFootprint = {
  /** Never happened and carries nothing — safe to delete. */
  removable: SeriesOccurrence[]
  /** Happened, was cancelled by hand, was charged, or was written about. */
  blocking: SeriesOccurrence[]
}

export const EMPTY_FOOTPRINT: SeriesFootprint = { removable: [], blocking: [] }

/**
 * Pure classifier. `chargedIds` / `notedIds` are the lesson ids that own a
 * charge or a lesson note; the caller loads them once for the whole org.
 */
export function hasFootprint(
  lesson: { id: string; status: string; cancel_reason: string | null },
  chargedIds: ReadonlySet<string>,
  notedIds: ReadonlySet<string>
): boolean {
  return (
    !isRemovableSeriesOccurrence(lesson) || chargedIds.has(lesson.id) || notedIds.has(lesson.id)
  )
}

/**
 * Classifies every series occurrence of the org, keyed by series id. Three
 * org-scoped queries regardless of how many series there are — never one query
 * per series. Both companion tables are indexed on `lesson_id`.
 *
 * A series with no lessons at all is absent from the map; callers should fall
 * back to EMPTY_FOOTPRINT.
 */
export async function loadSeriesFootprint(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  seriesIds?: string[]
): Promise<Map<string, SeriesFootprint>> {
  if (seriesIds && seriesIds.length === 0) return new Map()

  let lessonQuery = db
    .from('lessons')
    .select('id, series_id, status, cancel_reason, start_at')
    .eq('organization_id', orgId)
    .not('series_id', 'is', null)
  if (seriesIds) lessonQuery = lessonQuery.in('series_id', seriesIds)

  const { data: lessons, error } = await lessonQuery
  if (error) throw new Error(`Failed to load series lessons: ${error.message}`)
  if (!lessons?.length) return new Map()

  const [{ data: charges, error: chargeError }, { data: notes, error: noteError }] =
    await Promise.all([
      db
        .from('charges')
        .select('lesson_id')
        .eq('organization_id', orgId)
        .not('lesson_id', 'is', null),
      db.from('lesson_notes').select('lesson_id').eq('organization_id', orgId),
    ])
  if (chargeError) throw new Error(`Failed to load series charges: ${chargeError.message}`)
  if (noteError) throw new Error(`Failed to load series lesson notes: ${noteError.message}`)

  const chargedIds = new Set((charges ?? []).map((c) => c.lesson_id as string))
  const notedIds = new Set((notes ?? []).map((n) => n.lesson_id as string))

  const bySeries = new Map<string, SeriesFootprint>()
  for (const lesson of lessons) {
    const seriesId = lesson.series_id as string
    const bucket = bySeries.get(seriesId) ?? { removable: [], blocking: [] }
    const occurrence: SeriesOccurrence = {
      id: lesson.id,
      status: lesson.status,
      cancel_reason: lesson.cancel_reason,
      start_at: lesson.start_at,
    }
    if (hasFootprint(occurrence, chargedIds, notedIds)) bucket.blocking.push(occurrence)
    else bucket.removable.push(occurrence)
    bySeries.set(seriesId, bucket)
  }

  return bySeries
}

/**
 * Thrown when a series is asked to be deleted outright while some of its
 * occurrences still carry a footprint. It lives here rather than in
 * updateSeries.ts because that module is `'use server'`, and such a module may
 * only export async functions — exporting a class from it silently strips every
 * export, which only the build catches, not tsc.
 */
export class SeriesHasHistoryError extends Error {
  constructor(public readonly historyCount: number) {
    super(`Series has ${historyCount} lessons with history and cannot be deleted`)
    this.name = 'SeriesHasHistoryError'
  }
}
