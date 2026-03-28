/**
 * Organization holidays query helper.
 * Per /docs/sprint-10-scope.md § Story 2.
 */

import { createClient } from '@/lib/supabase/server'

export type OrgHoliday = {
  id: string
  date: string   // 'YYYY-MM-DD'
  name: string
}

export async function getOrgHolidays(orgId: string): Promise<OrgHoliday[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('organization_holidays')
    .select('id, date, name')
    .eq('organization_id', orgId)
    .order('date', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}
