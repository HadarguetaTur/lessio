import { createClient } from '@/lib/supabase/server'
export { DAY_NAMES } from './constants'

export interface AvailabilityWindow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

/** Normalize Postgres time "HH:MM:SS" → "HH:MM" for safe comparison */
function normalizeTime(t: string): string {
  return t.substring(0, 5)
}

/**
 * Returns true if [newStart, newEnd) overlaps any window in the list.
 * excludeId can be used when editing an existing window.
 */
export function hasOverlap(
  newStart: string,
  newEnd: string,
  existing: AvailabilityWindow[],
  excludeId?: string
): boolean {
  const ns = normalizeTime(newStart)
  const ne = normalizeTime(newEnd)
  return existing
    .filter((w) => w.id !== excludeId)
    .some((w) => ns < normalizeTime(w.end_time) && ne > normalizeTime(w.start_time))
}

export async function getTeacherAvailability(
  teacherId: string,
  organizationId: string
): Promise<AvailabilityWindow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('availability')
    .select('id, day_of_week, start_time, end_time')
    .eq('teacher_id', teacherId)
    .eq('organization_id', organizationId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Returns windows for a specific day — used for overlap check before insert. */
export async function getTeacherAvailabilityByDay(
  teacherId: string,
  organizationId: string,
  dayOfWeek: number
): Promise<AvailabilityWindow[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('availability')
    .select('id, day_of_week, start_time, end_time')
    .eq('teacher_id', teacherId)
    .eq('organization_id', organizationId)
    .eq('day_of_week', dayOfWeek)

  return data ?? []
}
