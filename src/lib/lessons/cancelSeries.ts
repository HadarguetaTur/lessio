/**
 * stopLessonSeries — server-only series stop logic.
 * Per /docs/sprint-11-scope.md § Story 2.
 *
 * Not a Server Action module — see the note in createSeries.ts. `orgId` comes
 * from the caller, so this must stay behind a session-resolving action.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

import { EMPTY_FOOTPRINT, loadSeriesFootprint } from './seriesFootprint'
import { getSeriesStopBoundary } from './seriesStop'

export type StopSeriesResult = {
  /** Planned occurrences deleted. */
  removed: number
  /** Occurrences at or after the cutoff that were left alone because they happened or were charged. */
  kept: number
  until: string
}

/**
 * Stops a materialized series from an organization-local calendar date.
 * Future plans are removed, not recorded as cancellations.
 *
 * A stop date may sit in the past — someone correcting a series that ran on
 * paper weeks ago — so the past is protected by the occurrence's footprint, not
 * by the date: anything completed, cancelled by hand, charged or written about
 * is skipped and counted in `kept`. Skipping rather than failing also matters at
 * the database level, since `charges.lesson_id` has no ON DELETE and a single
 * charged lesson inside the batch would otherwise abort the whole stop.
 */
export async function stopLessonSeries(
  seriesId: string,
  orgId: string,
  stopFromDate: string
): Promise<StopSeriesResult> {
  const db = createServiceRoleClient()
  const [{ data: org, error: orgError }, { data: series, error: seriesError }] = await Promise.all([
    db.from('organizations').select('timezone').eq('id', orgId).single(),
    db.from('lesson_series').select('id, rule').eq('id', seriesId).eq('organization_id', orgId).single(),
  ])
  if (orgError || !org) throw new Error(`Organization not found: ${orgError?.message}`)
  if (seriesError || !series) throw new Error(`Series not found: ${seriesError?.message}`)

  const timezone = org.timezone ?? 'Asia/Jerusalem'
  const { cutoffUtc, until } = getSeriesStopBoundary(stopFromDate, timezone)

  const footprint = (await loadSeriesFootprint(db, orgId, [seriesId])).get(seriesId) ?? EMPTY_FOOTPRINT
  // Postgres and Luxon render the same instant differently ('+00:00' vs 'Z'),
  // so these are compared as instants, never as strings.
  const cutoff = new Date(cutoffUtc).getTime()
  const atOrAfter = (lesson: { start_at: string }) => new Date(lesson.start_at).getTime() >= cutoff

  const removableIds = footprint.removable.filter(atOrAfter).map((lesson) => lesson.id)
  const kept = footprint.blocking.filter(atOrAfter).length

  if (removableIds.length > 0) {
    const { error: deleteError } = await db
      .from('lessons')
      .delete()
      .eq('organization_id', orgId)
      .eq('series_id', seriesId)
      .in('id', removableIds)
    if (deleteError) throw new Error(`Failed to remove future series lessons: ${deleteError.message}`)
  }

  const rule = series.rule as Record<string, unknown>
  const currentUntil = typeof rule.until === 'string' ? rule.until : null
  const storedUntil = currentUntil && currentUntil < until ? currentUntil : until
  const { error: updateError } = await db
    .from('lesson_series')
    .update({ rule: { ...rule, until: storedUntil }, stopped_at: new Date().toISOString() })
    .eq('id', seriesId)
    .eq('organization_id', orgId)
  if (updateError) throw new Error(`Failed to store series stop date: ${updateError.message}`)

  return { removed: removableIds.length, kept, until: storedUntil }
}
