'use server'

/**
 * cancelLessonSeries — server-only series cancellation logic.
 * Per /docs/sprint-11-scope.md § Story 2.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

import { SERIES_CANCEL_REASON } from './renderCancelReason'
import { getSeriesStopBoundary, isRemovableSeriesOccurrence } from './seriesStop'

export type CancelSeriesScope = 'all' | 'from_date'

export type StopSeriesResult = { removed: number; until: string }

/**
 * Stops a materialized series from an organization-local calendar date.
 * Future plans are removed, not recorded as cancellations: only scheduled
 * occurrences and rows previously cancelled by the old series-cancel path are
 * eligible. Manual cancellations and completed/no-show history are preserved.
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

  const { data: candidates, error: candidateError } = await db
    .from('lessons')
    .select('id, status, cancel_reason')
    .eq('series_id', seriesId)
    .eq('organization_id', orgId)
    .gte('start_at', cutoffUtc)
    .in('status', ['scheduled', 'cancelled'])
  if (candidateError) throw new Error(`Failed to find future series lessons: ${candidateError.message}`)

  const removableIds = (candidates ?? [])
    .filter(isRemovableSeriesOccurrence)
    .map((lesson) => lesson.id)

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
    .update({ rule: { ...rule, until: storedUntil } })
    .eq('id', seriesId)
    .eq('organization_id', orgId)
  if (updateError) throw new Error(`Failed to store series stop date: ${updateError.message}`)

  return { removed: removableIds.length, until: storedUntil }
}

/**
 * Cancels all scheduled lessons in a series.
 * scope='all' — all scheduled lessons
 * scope='from_date' — scheduled lessons with start_at >= fromDate
 *
 * Does NOT auto-charge cancellation fees.
 */
export async function cancelLessonSeries(
  seriesId: string,
  orgId: string,
  scope: CancelSeriesScope,
  fromDate?: string   // ISO date 'YYYY-MM-DD' — required when scope === 'from_date'
): Promise<{ cancelled: number }> {
  if (scope === 'from_date' && !fromDate) {
    throw new Error('fromDate is required when scope is from_date')
  }

  const db = createServiceRoleClient()

  let query = db
    .from('lessons')
    .update({
      status: 'cancelled',
      cancel_reason: SERIES_CANCEL_REASON,
      updated_at: new Date().toISOString(),
    })
    .eq('series_id', seriesId)
    .eq('organization_id', orgId)
    .eq('status', 'scheduled')

  if (scope === 'from_date' && fromDate) {
    query = query.gte('start_at', `${fromDate}T00:00:00.000Z`)
  }

  const { data, error } = await query.select('id')

  if (error) throw new Error(`Failed to cancel series: ${error.message}`)

  return { cancelled: (data ?? []).length }
}
