/**
 * Pieces shared between the webhook's per-role paths.
 *
 * The parent path owned these queries inline. Students need the same "what are
 * my next lessons" and "what homework is open" answers about themselves, so the
 * cores are lifted here and take `studentIds` — a parent passes their children's
 * ids, a student passes their own. One implementation, two callers.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendHomeworkAlert, sendTextMessage } from '@/lib/whatsapp'
import { botString } from '@/lib/whatsapp/strings'
import { markAssignmentDone } from '@/lib/homework'
import { parseAppLocale, toLuxonLocale, type AppLocale } from '@/lib/i18n/locale'
import type { ResolvedSender } from '@/lib/whatsapp/sender'

type Db = ReturnType<typeof createServiceRoleClient>

/** Everything a per-role handler needs. Assembled once in processMessage. */
export type HandlerContext = {
  db: Db
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  org: any
  sender: ResolvedSender
  senderPhone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
  timezone: string
  origin: string
  msg: { text: string; replyId?: string; messageId: string }
}

// ── Lessons ───────────────────────────────────────────────────────────────────

/**
 * Formats the next scheduled lessons for a set of students as numbered lines.
 * Returns the localized "nothing scheduled" string when there are none, so
 * callers can splice the result straight into a template variable.
 */
export async function buildUpcomingLessonLines(params: {
  db: Db
  orgId: string
  studentIds: string[]
  timezone: string
  locale: AppLocale
  limit?: number
}): Promise<string> {
  const { db, orgId, studentIds, timezone, locale } = params
  const limit = params.limit ?? 3
  const noLessons = botString('no_upcoming_lessons', locale)

  if (studentIds.length === 0) return noLessons

  const { data: lessonStudents, error: lsError } = await db
    .from('lesson_students')
    .select('lesson_id')
    .in('student_id', studentIds)
    .eq('organization_id', orgId)

  if (lsError) {
    console.error('[whatsapp/shared] lesson_students DB error', { orgId, error: lsError })
    throw new Error('Failed to load lesson relationships')
  }

  const lessonIds = (lessonStudents ?? []).map((r: { lesson_id: string }) => r.lesson_id)
  if (lessonIds.length === 0) return noLessons

  const { data: lessons, error: lessonsError } = await db
    .from('lessons')
    .select('start_at, teachers ( profiles ( full_name ) )')
    .in('id', lessonIds)
    .eq('organization_id', orgId)
    .eq('status', 'scheduled')
    .gt('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .limit(limit)

  if (lessonsError) {
    console.error('[whatsapp/shared] lessons DB error', { orgId, error: lessonsError })
    throw new Error('Failed to load scheduled lessons')
  }

  type LessonRow = {
    start_at: string
    teachers: { profiles: { full_name: string } | null } | null
  }

  const dateFormat = locale === 'he' ? 'EEEE, d בMMMM' : 'EEEE, MMMM d'
  const formatted = (lessons ?? []).map((l) => {
    const row = l as unknown as LessonRow
    const dt = DateTime.fromISO(row.start_at, { zone: 'utc' }).setZone(timezone)
    return {
      date: dt.toFormat(dateFormat, { locale: toLuxonLocale(locale) }),
      time: dt.toFormat('HH:mm'),
      teacherName:
        (row.teachers?.profiles as { full_name: string } | null)?.full_name ??
        botString('the_teacher', locale),
    }
  })

  if (formatted.length === 0) return noLessons

  return formatted
    .map((l, i) =>
      locale === 'he'
        ? `${i + 1}. ${l.date} בשעה ${l.time} עם ${l.teacherName}`
        : `${i + 1}. ${l.date} at ${l.time} with ${l.teacherName}`
    )
    .join('\n')
}

// ── Homework ──────────────────────────────────────────────────────────────────

export type OpenAssignment = {
  id: string
  title: string
  studentId: string
  teacherId: string
  dueDate: string | null
}

/** Open (pending) assignments for a set of students, newest first. */
export async function findOpenAssignments(params: {
  db: Db
  orgId: string
  studentIds: string[]
  limit?: number
}): Promise<OpenAssignment[]> {
  const { db, orgId, studentIds } = params
  if (studentIds.length === 0) return []

  const { data, error } = await db
    .from('homework_assignments')
    .select('id, title, student_id, teacher_id, due_date')
    .in('student_id', studentIds)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 5)

  if (error) {
    console.error('[whatsapp/shared] homework_assignments DB error', { orgId, error })
    throw new Error('Failed to load homework assignments')
  }

  type Row = {
    id: string
    title: string
    student_id: string
    teacher_id: string
    due_date: string | null
  }

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    studentId: r.student_id,
    teacherId: r.teacher_id,
    dueDate: r.due_date,
  }))
}

/** Formats open assignments as lines for the student's homework list. */
export function formatHomeworkLines(
  assignments: OpenAssignment[],
  locale: AppLocale,
  timezone: string
): string {
  return assignments
    .map((a) => {
      const due = a.dueDate
        ? `${botString('due_by', locale)} ${DateTime.fromISO(a.dueDate, { zone: timezone }).toFormat('dd/MM')}`
        : botString('no_due_date', locale)
      return `\n• ${a.title} — ${due}`
    })
    .join('')
}

/**
 * Marks an assignment done and alerts its teacher in the teacher's own UI
 * language. `markedBy` only changes the wording of that alert — a teacher
 * reading "the student marked it" wants to know it was not the parent.
 */
export async function markAssignmentDoneAndAlert(params: {
  db: Db
  orgId: string
  assignment: OpenAssignment
  studentName: string
  markedBy: 'parent' | 'student'
  accessToken: string
  phoneNumberId: string
}): Promise<void> {
  const { db, orgId, assignment, studentName, markedBy, accessToken, phoneNumberId } = params

  await markAssignmentDone({ assignmentId: assignment.id, organizationId: orgId })

  const { data: teacherProfile } = await db
    .from('teachers')
    .select('profiles ( phone, preferred_locale )')
    .eq('id', assignment.teacherId)
    .single()

  const teacherRow = (
    teacherProfile as {
      profiles: { phone: string | null; preferred_locale: string | null } | null
    } | null
  )?.profiles

  if (!teacherRow?.phone) return

  const teacherLocale = parseAppLocale(teacherRow.preferred_locale ?? undefined)
  await sendHomeworkAlert(
    teacherRow.phone,
    studentName,
    assignment.title,
    accessToken,
    phoneNumberId,
    teacherLocale,
    markedBy
  ).catch((err) => {
    console.error('[whatsapp/shared] Homework alert to teacher failed', { orgId, err })
  })
}

// ── Parents ───────────────────────────────────────────────────────────────────

/** The parent a student's money hangs off. */
export type BillingParent = { id: string; phone: string | null; locale: AppLocale }

/**
 * The parent whose account a student's booking and cancellation run through —
 * `is_primary` first, then whichever active relationship exists.
 *
 * A student writing in is the subject of the action but never the account: the
 * booking token carries a parent id, and a cancellation charge is created
 * against a parent. Returns null when the student has no active parent linked,
 * in which case there is nobody to bill and nothing to sign.
 */
export async function findBillingParent(
  db: Db,
  orgId: string,
  studentId: string
): Promise<BillingParent | null> {
  const { data, error } = await db
    .from('relationships')
    .select('is_primary, parents!inner ( id, phone, preferred_locale, is_active )')
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .eq('parents.is_active', true)
    .order('is_primary', { ascending: false })
    .limit(1)

  if (error) {
    console.error('[whatsapp/shared] billing parent lookup failed', { orgId, studentId, error })
    throw new Error('Failed to resolve the billing parent for a student')
  }

  type Row = {
    parents: { id: string; phone: string | null; preferred_locale: string | null } | null
  }
  const parent = ((data ?? []) as unknown as Row[])[0]?.parents
  if (!parent) return null

  return {
    id: parent.id,
    phone: parent.phone,
    locale: parseAppLocale(parent.preferred_locale ?? undefined),
  }
}

/** Looks up a student's display name, falling back to the generic noun. */
export async function studentDisplayName(
  db: Db,
  orgId: string,
  studentId: string,
  locale: AppLocale
): Promise<string> {
  const { data } = await db
    .from('students')
    .select('full_name')
    .eq('id', studentId)
    .eq('organization_id', orgId)
    .maybeSingle()

  return (data as { full_name: string | null } | null)?.full_name ?? botString('the_student', locale)
}

// ── Replies ───────────────────────────────────────────────────────────────────

/** Sends a plain bot string. Thin, but it keeps the handlers readable. */
export async function replyWith(
  ctx: Pick<HandlerContext, 'senderPhone' | 'accessToken' | 'phoneNumberId' | 'locale'>,
  key: Parameters<typeof botString>[0],
  vars: Record<string, string> = {}
): Promise<void> {
  await sendTextMessage(
    ctx.senderPhone,
    botString(key, ctx.locale, vars),
    ctx.accessToken,
    ctx.phoneNumberId
  )
}
