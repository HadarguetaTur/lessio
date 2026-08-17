import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Lesson, LessonAccessScope, LessonStatus, LessonType } from '@/lib/lessons/types'

export type { Lesson, LessonAccessScope, LessonStatus, LessonType } from '@/lib/lessons/types'
export { formatTime, formatDate } from '@/lib/lessons/format'

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

/**
 * Returns 7 YYYY-MM-DD strings (sv-SE) for Sun→Sat starting from weekSundayStr,
 * each interpreted in `timezone` so they match lesson bucketing and getCurrentDayStr.
 */
export function getWeekDays(weekSundayStr: string, timezone: string): string[] {
  const base = new Date(`${weekSundayStr}T12:00:00Z`)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000)
    return d.toLocaleDateString('sv-SE', { timeZone: timezone })
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLesson(l: any): Lesson {
  const rawTeacher = l.teachers as
    | { id: string; profiles: { full_name: string } | null }
    | { id: string; profiles: { full_name: string } | null }[]
    | null
  const teacherRow = Array.isArray(rawTeacher) ? rawTeacher[0] ?? null : rawTeacher
  // lesson_students is an array; prefer a row with a resolved student join (FK can be null if orphaned).
  type LsRow = { student_id: string; students: { id: string; full_name: string } | null }
  const rows = l.lesson_students as LsRow[] | undefined
  const ls = rows?.find((r) => r.students != null) ?? rows?.[0]
  const st = ls?.students
  return {
    id: l.id,
    start_at: l.start_at,
    end_at: l.end_at,
    status: l.status as LessonStatus,
    lesson_type: (l.lesson_type ?? 'individual') as LessonType,
    cancel_reason: l.cancel_reason,
    series_id: l.series_id ?? null,
    teacher: {
      id: teacherRow?.id ?? '',
      full_name: teacherRow?.profiles?.full_name ?? '—',
    },
    student: st
      ? { id: st.id, full_name: st.full_name }
      : { id: (ls?.student_id as string | undefined) ?? '', full_name: '—' },
  }
}

const LESSON_SELECT =
  'id, start_at, end_at, status, cancel_reason, lesson_type, series_id, teachers(id, profiles(full_name)), lesson_students(student_id, students(id, full_name))'

async function getLessonIdsForStudent(studentId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_students')
    .select('lesson_id')
    .eq('student_id', studentId)
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map((r) => r.lesson_id as string))]
}

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

/** Returns today's date as YYYY-MM-DD in the given timezone */
export function getCurrentDayStr(timezone: string): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: timezone })
}

/**
 * Returns an array of day cells for a month calendar grid (7 cols).
 * Includes padding days from prev/next month to fill the first and last weeks.
 */
export function getMonthDays(
  monthStr: string, // "YYYY-MM"
): Array<{ dateStr: string; isCurrentMonth: boolean }> {
  const [year, month] = monthStr.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const lastDay = new Date(Date.UTC(year, month, 0))

  // Sunday = 0; pad from previous month
  const startDow = firstDay.getUTCDay()
  const endDow = lastDay.getUTCDay()

  const days: Array<{ dateStr: string; isCurrentMonth: boolean }> = []

  // Padding from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(firstDay.getTime() - (i + 1) * 24 * 60 * 60 * 1000)
    days.push({ dateStr: d.toISOString().substring(0, 10), isCurrentMonth: false })
  }

  // Current month days
  const daysInMonth = lastDay.getUTCDate()
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(firstDay.getTime() + i * 24 * 60 * 60 * 1000)
    days.push({ dateStr: d.toISOString().substring(0, 10), isCurrentMonth: true })
  }

  // Padding from next month to complete the last row
  const remaining = (7 - ((endDow + 1) % 7)) % 7
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(lastDay.getTime() + i * 24 * 60 * 60 * 1000)
    days.push({ dateStr: d.toISOString().substring(0, 10), isCurrentMonth: false })
  }

  return days
}

/** Fetch lessons between two YYYY-MM-DD dates (inclusive) in the org timezone */
export async function getLessonsForRange(
  organizationId: string,
  timezone: string,
  fromDateStr: string,
  toDateStr: string,
  teacherId?: string,
  studentId?: string
): Promise<Lesson[]> {
  const supabase = await createClient()
  const fromUTC = localMidnightToUTC(fromDateStr, timezone)
  // end = midnight of the day after toDateStr
  const toBase = new Date(`${toDateStr}T12:00:00Z`)
  const nextDay = new Date(toBase.getTime() + 24 * 60 * 60 * 1000)
  const nextDayStr = nextDay.toISOString().substring(0, 10)
  const toUTC = localMidnightToUTC(nextDayStr, timezone)

  let lessonIds: string[] | undefined
  if (studentId) {
    lessonIds = await getLessonIdsForStudent(studentId)
    if (lessonIds.length === 0) return []
  }

  let query = supabase
    .from('lessons')
    .select(LESSON_SELECT)
    .eq('organization_id', organizationId)
    .gte('start_at', fromUTC.toISOString())
    .lt('start_at', toUTC.toISOString())
    .order('start_at', { ascending: true })

  if (teacherId) {
    query = query.eq('teacher_id', teacherId)
  }
  if (lessonIds) {
    query = query.in('id', lessonIds)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapLesson)
}

export async function getLessonsForWeek(
  organizationId: string,
  timezone: string,
  weekSundayStr: string,
  teacherId?: string,
  studentId?: string
): Promise<Lesson[]> {
  const supabase = await createClient()
  const weekStartUTC = localMidnightToUTC(weekSundayStr, timezone)
  const weekEndUTC = new Date(weekStartUTC.getTime() + 7 * 24 * 60 * 60 * 1000)

  let lessonIds: string[] | undefined
  if (studentId) {
    lessonIds = await getLessonIdsForStudent(studentId)
    if (lessonIds.length === 0) return []
  }

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
  if (lessonIds) {
    query = query.in('id', lessonIds)
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

  if (!current) throw new Error('validation.lessonNotFound')
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
