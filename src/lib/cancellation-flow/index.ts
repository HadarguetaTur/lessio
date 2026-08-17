/**
 * Cancellation flow — state machine and helpers.
 * Per /docs/sprint-4-scope.md § WhatsApp Cancellation.
 * Per /docs/decisions.md #14 (timeout = 10 minutes).
 *
 * Uses service-role client (called from webhook context).
 */

export { executeCancellation } from './executeCancellation'
export type { ExecuteCancellationOutcome, ExecuteCancellationResult, ExecuteCancellationFailure, CancellationError } from './executeCancellation'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { toIntlLocale, type AppLocale } from '@/lib/i18n/locale'
import { botString } from '@/lib/whatsapp/strings'

const SESSION_TIMEOUT_MINUTES = 10

export interface EligibleLesson {
  id: string
  start_at: string
  student_name: string
  teacher_name: string
}

export interface CancellationSession {
  id: string
  organization_id: string
  phone: string
  lesson_ids: string[]
  expires_at: string
}

/**
 * Fetches scheduled lessons within the next 7 days for a parent's students.
 * Returns lessons ordered by start_at ascending.
 *
 * `onlyStudentIds` narrows the result to a subset — the student path passes
 * their own id so a student never sees a sibling's lesson. It intersects with
 * the parent's students rather than replacing them, so it can only ever
 * restrict what comes back, never widen it.
 */
export async function getEligibleLessons(
  orgId: string,
  parentId: string,
  onlyStudentIds?: string[]
): Promise<EligibleLesson[]> {
  const db = createServiceRoleClient()

  // Get all student IDs for this parent
  const { data: rels, error: relError } = await db
    .from('relationships')
    .select('student_id')
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)

  if (relError || !rels || rels.length === 0) return []

  let studentIds = rels.map((r: { student_id: string }) => r.student_id)

  if (onlyStudentIds) {
    const allowed = new Set(onlyStudentIds)
    studentIds = studentIds.filter((id: string) => allowed.has(id))
    if (studentIds.length === 0) return []
  }

  const now = new Date()
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Step 1: resolve lesson IDs for this parent's students via junction table
  const { data: lessonStudentRows, error: lsError } = await db
    .from('lesson_students')
    .select('lesson_id, student_id, students(full_name)')
    .in('student_id', studentIds)

  if (lsError || !lessonStudentRows || lessonStudentRows.length === 0) return []

  const lessonIds = [...new Set(lessonStudentRows.map((r: { lesson_id: string }) => r.lesson_id))]

  // Step 2: fetch those lessons with status + teacher, filtered by window
  const { data: lessons, error: lessonError } = await db
    .from('lessons')
    .select('id, start_at, teachers(profiles(full_name))')
    .eq('organization_id', orgId)
    .eq('status', 'scheduled')
    .in('id', lessonIds)
    .gte('start_at', now.toISOString())
    .lt('start_at', sevenDaysLater.toISOString())
    .order('start_at', { ascending: true })

  if (lessonError || !lessons) return []

  // Build a lookup: lesson_id → student name
  const studentNameByLesson = new Map<string, string>()
  for (const row of lessonStudentRows as unknown as Array<{ lesson_id: string; student_id: string; students: { full_name: string } }>) {
    if (!studentNameByLesson.has(row.lesson_id)) {
      studentNameByLesson.set(row.lesson_id, row.students.full_name)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return lessons.map((l: any) => ({
    id: l.id,
    start_at: l.start_at,
    student_name: studentNameByLesson.get(l.id) ?? '—',
    teacher_name: (l.teachers as { profiles: { full_name: string } }).profiles.full_name,
  }))
}

/**
 * Formats a numbered lesson list message for WhatsApp.
 * Times are displayed in the given IANA timezone.
 */
export function formatLessonListMessage(
  lessons: EligibleLesson[],
  timezone: string,
  locale: AppLocale = 'he'
): string {
  const intlLocale = toIntlLocale(locale)
  const lines = lessons.map((lesson, index) => {
    const date = new Date(lesson.start_at).toLocaleDateString(intlLocale, {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    const time = new Date(lesson.start_at).toLocaleTimeString(intlLocale, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const at = locale === 'he' ? 'בשעה' : 'at'
    const teacherLabel = locale === 'he' ? 'מורה' : 'teacher'
    return `${index + 1}. ${lesson.student_name}, ${date} ${at} ${time}, ${teacherLabel}: ${lesson.teacher_name}`
  })

  const header = botString('cancellation_list_header', locale)
  const footer = botString('cancellation_list_footer', locale)
  return `${header}\n\n${lines.join('\n')}\n\n${footer}`
}

/**
 * Creates or replaces a cancellation session for the given phone.
 * Expires in SESSION_TIMEOUT_MINUTES.
 */
export async function upsertCancellationSession(
  orgId: string,
  phone: string,
  lessonIds: string[]
): Promise<void> {
  const db = createServiceRoleClient()
  const expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()

  const { error } = await db
    .from('cancellation_sessions')
    .upsert(
      { organization_id: orgId, phone, lesson_ids: lessonIds, expires_at: expiresAt },
      { onConflict: 'organization_id,phone' }
    )

  if (error) {
    throw new Error(`[upsertCancellationSession] Failed: ${error.message}`)
  }
}

/**
 * Returns the active (non-expired) cancellation session for the given phone, or null.
 */
export async function getActiveCancellationSession(
  orgId: string,
  phone: string
): Promise<CancellationSession | null> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('cancellation_sessions')
    .select('id, organization_id, phone, lesson_ids, expires_at')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) return null
  return data as CancellationSession
}

/**
 * Deletes the cancellation session for the given phone (on completion or timeout cleanup).
 */
export async function deleteCancellationSession(
  orgId: string,
  phone: string
): Promise<void> {
  const db = createServiceRoleClient()
  await db
    .from('cancellation_sessions')
    .delete()
    .eq('organization_id', orgId)
    .eq('phone', phone)
}
