import { createClient } from '@/lib/supabase/server'

export interface AvailabilityOverride {
  id: string
  override_date: string
  is_available: boolean
  start_time: string | null
  end_time: string | null
  reason: string | null
  created_at: string
}

export async function getTeacherOverrides(
  teacherId: string,
  organizationId: string
): Promise<AvailabilityOverride[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('availability_overrides')
    .select('id, override_date, is_available, start_time, end_time, reason, created_at')
    .eq('teacher_id', teacherId)
    .eq('organization_id', organizationId)
    .order('override_date', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}
