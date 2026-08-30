/**
 * Organization holidays query helper.
 * Per /docs/sprint-10-scope.md § Story 2.
 */

import { DateTime } from 'luxon'
import { createClient } from '@/lib/supabase/server'

export type OrgHoliday = {
  id: string
  date: string   // 'YYYY-MM-DD'
  name: string
  source: 'manual' | 'auto'
}

export async function getOrgHolidays(
  orgId: string,
  opts: { from?: string } = {}
): Promise<OrgHoliday[]> {
  const supabase = await createClient()

  let query = supabase
    .from('organization_holidays')
    .select('id, date, name, source')
    .eq('organization_id', orgId)
    .order('date', { ascending: true })
  if (opts.from) {
    query = query.gte('date', opts.from)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Lower bound for calendar-page holiday reads: start of the previous month.
 * Auto-population keeps ~18 months of future holidays per org, so calendar
 * consumers should not ship the full history to the client.
 */
export function calendarHolidaysFrom(): string {
  return DateTime.now().minus({ months: 1 }).startOf('month').toISODate()!
}
