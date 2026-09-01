import { createClient } from '@/lib/supabase/server'
import { normalizeTime } from './constants'
export { DAY_KEYS, normalizeTime, type DayKey } from './constants'

export interface AvailabilityWindow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
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

/**
 * Parse the repeated `day_of_week` fields of the weekly grid's add form.
 * Returns null when anything is out of range — the caller turns that into a
 * "pick a day" message rather than silently dropping a day the user selected.
 */
export function parseDayList(raw: FormDataEntryValue[]): number[] | null {
  if (raw.length === 0) return null
  const days = new Set<number>()
  for (const value of raw) {
    const n = parseInt(String(value), 10)
    if (isNaN(n) || n < 0 || n > 6) return null
    days.add(n)
  }
  return [...days].sort((a, b) => a - b)
}

/**
 * Of `days`, which ones already have a window overlapping [start, end)?
 * Adding a window to several days at once is all-or-nothing: a partial insert
 * is impossible to describe in the single error string the form can show.
 */
export function conflictingDays(
  days: number[],
  start: string,
  end: string,
  all: AvailabilityWindow[],
  excludeId?: string
): number[] {
  return days.filter((day) =>
    hasOverlap(
      start,
      end,
      all.filter((w) => w.day_of_week === day),
      excludeId
    )
  )
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

/**
 * Why a write was rejected, as a key rather than a sentence: the three call
 * sites (owner route, teacher route, and their tests) translate it themselves,
 * so the validation lives in exactly one place while the wording stays with
 * next-intl.
 */
export type AvailabilityMutationError =
  | { key: 'pickDays' }
  | { key: 'fillTimes' }
  | { key: 'endAfterStart' }
  | { key: 'overlappingDays'; days: number[] }
  | { key: 'windowNotFound' }
  | { key: 'saveAvailabilityFailed' }
  | { key: 'updateAvailabilityFailed' }
  | { key: 'deleteAvailabilityFailed' }

function readTimes(formData: FormData): { start: string; end: string } | AvailabilityMutationError {
  const start = String(formData.get('start_time') ?? '').trim()
  const end = String(formData.get('end_time') ?? '').trim()
  if (!start || !end) return { key: 'fillTimes' }
  if (start >= end) return { key: 'endAfterStart' }
  return { start, end }
}

/**
 * Add one window to every selected weekday. All-or-nothing on overlap — a
 * partial insert cannot be described in the single error string the form shows.
 */
export async function createAvailabilityWindows(
  organizationId: string,
  teacherId: string,
  formData: FormData
): Promise<AvailabilityMutationError | null> {
  const days = parseDayList(formData.getAll('day_of_week'))
  if (!days) return { key: 'pickDays' }

  const times = readTimes(formData)
  if ('key' in times) return times

  const all = await getTeacherAvailability(teacherId, organizationId)
  const clashes = conflictingDays(days, times.start, times.end, all)
  if (clashes.length > 0) return { key: 'overlappingDays', days: clashes }

  const supabase = await createClient()
  const { error } = await supabase.from('availability').insert(
    days.map((day) => ({
      organization_id: organizationId,
      teacher_id: teacherId,
      day_of_week: day,
      start_time: times.start,
      end_time: times.end,
    }))
  )
  if (error) return { key: 'saveAvailabilityFailed' }
  return null
}

/**
 * Retime an existing window. The weekday is deliberately fixed — moving a
 * window across days is delete-then-add, which keeps the overlap check to the
 * one day it belongs to.
 */
export async function updateAvailabilityWindow(
  organizationId: string,
  teacherId: string,
  formData: FormData
): Promise<AvailabilityMutationError | null> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { key: 'windowNotFound' }

  const times = readTimes(formData)
  if ('key' in times) return times

  const supabase = await createClient()
  // Read the row first: `teacherId` comes from the URL on the owner route, so
  // this is what stops one teacher's id from retiming another's window.
  const { data: row } = await supabase
    .from('availability')
    .select('id, day_of_week, teacher_id')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (!row) return { key: 'windowNotFound' }

  const sameDay = await getTeacherAvailabilityByDay(teacherId, organizationId, row.day_of_week)
  if (hasOverlap(times.start, times.end, sameDay, id)) {
    return { key: 'overlappingDays', days: [row.day_of_week] }
  }

  const { error } = await supabase
    .from('availability')
    .update({ start_time: times.start, end_time: times.end })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('teacher_id', teacherId)
  if (error) return { key: 'updateAvailabilityFailed' }
  return null
}

export async function deleteAvailabilityWindow(
  organizationId: string,
  teacherId: string,
  formData: FormData
): Promise<AvailabilityMutationError | null> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { key: 'windowNotFound' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('availability')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('teacher_id', teacherId)
  if (error) return { key: 'deleteAvailabilityFailed' }
  return null
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
