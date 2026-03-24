import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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

export interface LessonAccessScope {
  organizationId: string
  teacherId: string
}

/** Parse UTC offset in milliseconds for a given timezone at a given moment */
function getOffsetMs(timezone: string, at: Date): number {
  const tzName =
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0'
  const m = tzName.match(/^GMT([+-])(\d+)(?::(\d+))?$/)
  const sign = m?.[1] === '-' ? -1 : 1
  const h = parseInt(m?.[2] ?? '0', 10)
  const min = parseInt(m?.[3] ?? '0', 10)
  return sign * (h * 60 + min) * 60 * 1000
}

/** Convert a YYYY-MM-DD local date string to UTC midnight Date */
export function localMidnightToUTC(dateStr: string, timezone: string): Date {
  const noon = new Date(`${dateStr}T12:00:00Z`)
  const offsetMs = getOffsetMs(timezone, noon)
  return new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() - offsetMs)
}

/**
 * Calculates start and end UTC ISO strings for "today" in the given IANA timezone.
 */
export function getTodayRange(timezone: string): { gte: string; lt: string } {
  const now = new Date()
  const todayDate = now.toLocaleDateString('sv-SE', { timeZone: timezone })
  const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowDate = nextDay.toLocaleDateString('sv-SE', { timeZone: timezone })
  return {
    gte: localMidnightToUTC(todayDate, timezone).toISOString(),
    lt: localMidnightToUTC(tomorrowDate, timezone).toISOString(),
  }
}

/** Returns the YYYY-MM-DD (in org timezone) for the Sunday of the current week */
export function getCurrentWeekSunday(timezone: string): string {
  const now = new Date()
  const todayStr = now.toLocaleDateString('sv-SE', { timeZone: timezone })
  const dayAbbr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(now)
  const DOW: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  const dow = DOW[dayAbbr] ?? 0
  if (dow === 0) return todayStr
  const base = new Date(`${todayStr}T12:00:00Z`)
  const sunday = new Date(base.getTime() - dow * 24 * 60 * 60 * 1000)
  return sunday.toISOString().substring(0, 10)
}

/** Returns 7 YYYY-MM-DD strings starting from weekSundayStr */
export function getWeekDays(weekSundayStr: string): string[] {
  const base = new Date(`${weekSundayStr}T12:00:00Z`)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000)
    return d.toISOString().substring(0, 10)
  })
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

/** Format a UTC ISO timestamp as a full Hebrew date string */
export function formatDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLesson(l: any): Lesson {
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
}

const LESSON_SELECT =
  'id, start_at, end_at, status, cancel_reason, teachers(id, profiles(full_name)), students(id, full_name)'

export async function getTodayLessons(
  organizationId: string,
  timezone: string
): Promise<Lesson[]> {
  const supabase = await createClient()
  const { gte, lt } = getTodayRange(timezone)

  const { data, error } = await supabase
    .from('lessons')
    .select(LESSON_SELECT)
    .eq('organization_id', organizationId)
    .gte('start_at', gte)
    .lt('start_at', lt)
    .order('start_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

export async function getLessonsForWeek(
  organizationId: string,
  timezone: string,
  weekSundayStr: string,
  teacherId?: string
): Promise<Lesson[]> {
  const supabase = await createClient()
  const weekStartUTC = localMidnightToUTC(weekSundayStr, timezone)
  const weekEndUTC = new Date(weekStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000)

  let query = supabase
    .from('lessons')
    .select(LESSON_SELECT)
    .eq('organization_id', organizationId)
    .gte('start_at', weekStartUTC.toISOString())
    .lt('start_at', weekEndUTC.toISOString())
    .order('start_at', { ascending: true })

  if (teacherId) {
    query = query.eq('teacher_id', teacherId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

/**
 * Returns true if the status transition from current → next is allowed.
 * Business rule: cancelled is a terminal state — no further transitions permitted.
 */
export function isValidStatusTransition(
  current: LessonStatus,
  next: LessonStatus
): boolean {
  return current !== 'cancelled' && ['scheduled', 'completed', 'cancelled', 'no_show'].includes(next)
}

export async function updateLessonStatus(
  id: string,
  organizationId: string,
  status: LessonStatus,
  cancelReason?: string
): Promise<void> {
  const supabase = await createClient()

  const { data: current } = await supabase
    .from('lessons')
    .select('status')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  if (!current) throw new Error('שיעור לא נמצא')
  if (!isValidStatusTransition(current.status, status)) {
    throw new Error('לא ניתן לשנות סטטוס של שיעור שבוטל')
  }

  const update: Record<string, string | null> = { status }
  if (status === 'cancelled') {
    update.cancel_reason = cancelReason ?? null
  } else {
    update.cancel_reason = null
  }

  const { error } = await supabase
    .from('lessons')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)

  if (error) throw new Error(error.message)
}

/**
 * Returns lesson ownership metadata regardless of the caller's org/role.
 * Uses service role to bypass RLS. Used solely for 403 vs 404 distinction.
 */
export async function getLessonAccessScope(id: string): Promise<LessonAccessScope | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('lessons')
    .select('organization_id, teacher_id')
    .eq('id', id)
    .single()
  if (!data) return null

  return {
    organizationId: data.organization_id,
    teacherId: data.teacher_id,
  }
}

export async function getLessonOrgId(id: string): Promise<string | null> {
  const scope = await getLessonAccessScope(id)
  return scope?.organizationId ?? null
}

export async function getLessonById(
  id: string,
  organizationId: string
): Promise<Lesson | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .select(LESSON_SELECT)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()

  if (error || !data) return null
  return mapLesson(data)
}
