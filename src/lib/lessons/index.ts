import { createClient } from '@/lib/supabase/server'

export type LessonStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export interface Lesson {
  id: string
  start_at: string
  end_at: string
  status: LessonStatus
  cancel_reason: string | null
  teacher: { id: string; full_name: string }
  student: { id: string; full_name: string }
}

/**
 * Calculates start and end UTC ISO strings for "today" in the given IANA timezone.
 * Uses Intl.DateTimeFormat with shortOffset to determine the current UTC offset.
 */
export function getTodayRange(timezone: string): { gte: string; lt: string } {
  const now = new Date()

  // Today's date string in org timezone (sv-SE gives "YYYY-MM-DD")
  const todayDate = now.toLocaleDateString('sv-SE', { timeZone: timezone })

  // Tomorrow's date string
  const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowDate = nextDay.toLocaleDateString('sv-SE', { timeZone: timezone })

  // Parse the UTC offset from the timezone at this moment ("GMT+3" / "GMT+2" etc.)
  const tzName =
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0'

  const m = tzName.match(/^GMT([+-])(\d+)(?::(\d+))?$/)
  const sign = m?.[1] === '-' ? -1 : 1
  const h = parseInt(m?.[2] ?? '0', 10)
  const min = parseInt(m?.[3] ?? '0', 10)
  const offsetMs = sign * (h * 60 + min) * 60 * 1000

  // local midnight = UTC midnight - offset
  const startUTC = new Date(`${todayDate}T00:00:00.000Z`).getTime() - offsetMs
  const endUTC = new Date(`${tomorrowDate}T00:00:00.000Z`).getTime() - offsetMs

  return {
    gte: new Date(startUTC).toISOString(),
    lt: new Date(endUTC).toISOString(),
  }
}

/** Format a UTC ISO timestamp as HH:MM in the given timezone. */
export function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export async function getTodayLessons(
  organizationId: string,
  timezone: string
): Promise<Lesson[]> {
  const supabase = await createClient()
  const { gte, lt } = getTodayRange(timezone)

  const { data, error } = await supabase
    .from('lessons')
    .select(
      'id, start_at, end_at, status, cancel_reason, teachers(id, profiles(full_name)), students(id, full_name)'
    )
    .eq('organization_id', organizationId)
    .gte('start_at', gte)
    .lt('start_at', lt)
    .order('start_at', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((l) => {
    const teacher = l.teachers as unknown as { id: string; profiles: { full_name: string } }
    const student = l.students as unknown as { id: string; full_name: string }
    return {
      id: l.id,
      start_at: l.start_at,
      end_at: l.end_at,
      status: l.status as LessonStatus,
      cancel_reason: l.cancel_reason,
      teacher: { id: teacher.id, full_name: teacher.profiles.full_name },
      student: { id: student.id, full_name: student.full_name },
    }
  })
}

export async function getLessonsForWeek(
  organizationId: string,
  timezone: string,
  weekStart: Date
): Promise<Lesson[]> {
  const supabase = await createClient()

  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('lessons')
    .select(
      'id, start_at, end_at, status, cancel_reason, teachers(id, profiles(full_name)), students(id, full_name)'
    )
    .eq('organization_id', organizationId)
    .gte('start_at', weekStart.toISOString())
    .lt('start_at', weekEnd.toISOString())
    .order('start_at', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((l) => {
    const teacher = l.teachers as unknown as { id: string; profiles: { full_name: string } }
    const student = l.students as unknown as { id: string; full_name: string }
    return {
      id: l.id,
      start_at: l.start_at,
      end_at: l.end_at,
      status: l.status as LessonStatus,
      cancel_reason: l.cancel_reason,
      teacher: { id: teacher.id, full_name: teacher.profiles.full_name },
      student: { id: student.id, full_name: student.full_name },
    }
  })
}
