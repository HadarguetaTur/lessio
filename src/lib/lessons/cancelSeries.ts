'use server'

/**
 * cancelLessonSeries — server-only series cancellation logic.
 * Per /docs/sprint-11-scope.md § Story 2.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type CancelSeriesScope = 'all' | 'from_date'

/**
 * Stored on the lesson row and read back much later, so it is a stable code
 * rather than display copy — the UI resolves it at render time.
 */
export const SERIES_CANCEL_REASON = 'SERIES_CANCELLED'

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
