import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type CreateLessonParams = {
  orgId: string
  teacherId: string
  studentId: string
  date: string            // YYYY-MM-DD in org timezone
  startTime: string       // HH:MM in org timezone
  durationMinutes: number
  createdByProfileId: string
}

export type CreateLessonResult = {
  lessonId: string
  startAt: string         // UTC ISO
  endAt: string           // UTC ISO
}

export class LessonConflictError extends Error {
  reason: 'holiday' | 'teacher_conflict' | 'student_conflict'

  constructor(reason: 'holiday' | 'teacher_conflict' | 'student_conflict') {
    super(`Cannot create lesson: ${reason}`)
    this.name = 'LessonConflictError'
    this.reason = reason
  }
}

/**
 * Creates a single (non-recurring) lesson with full conflict checks.
 * Same validation rules as createLessonSeries:
 *   - holiday block
 *   - teacher overlap (non-cancelled lessons)
 *   - student overlap (via lesson_students junction)
 *
 * Per /docs/sprint-13-scope.md § Story 2.
 */
export async function createLesson(
  params: CreateLessonParams
): Promise<CreateLessonResult> {
  const { orgId, teacherId, studentId, date, startTime, durationMinutes, createdByProfileId } = params
  const db = createServiceRoleClient()

  // 1. Fetch org timezone
  const { data: org } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .single()
  if (!org) throw new Error(`Organization not found: ${orgId}`)

  // 2. Build UTC start/end
  const slotStart = DateTime.fromISO(`${date}T${startTime}`, { zone: org.timezone }).toUTC()
  const slotEnd = slotStart.plus({ minutes: durationMinutes })
  const startUtc = slotStart.toISO()!
  const endUtc = slotEnd.toISO()!

  // 3. Holiday check
  const { data: holiday } = await db
    .from('organization_holidays')
    .select('id')
    .eq('organization_id', orgId)
    .eq('date', date)
    .maybeSingle()
  if (holiday) throw new LessonConflictError('holiday')

  // 4. Teacher overlap check (non-cancelled lessons)
  const { data: teacherConflict } = await db
    .from('lessons')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('organization_id', orgId)
    .neq('status', 'cancelled')
    .lt('start_at', endUtc)
    .gt('end_at', startUtc)
    .limit(1)
  if (teacherConflict?.length) throw new LessonConflictError('teacher_conflict')

  // 5. Student overlap check via lesson_students
  const { data: studentLessonIds } = await db
    .from('lesson_students')
    .select('lesson_id')
    .eq('student_id', studentId)
  if (studentLessonIds?.length) {
    const ids = studentLessonIds.map((r) => r.lesson_id)
    const { data: studentConflict } = await db
      .from('lessons')
      .select('id')
      .in('id', ids)
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .lt('start_at', endUtc)
      .gt('end_at', startUtc)
      .limit(1)
    if (studentConflict?.length) throw new LessonConflictError('student_conflict')
  }

  // 6. Insert lesson
  const { data: lesson, error: lessonError } = await db
    .from('lessons')
    .insert({
      organization_id: orgId,
      teacher_id: teacherId,
      start_at: startUtc,
      end_at: endUtc,
      status: 'scheduled',
      lesson_type: 'individual',
      max_students: 1,
    })
    .select('id, start_at, end_at')
    .single()
  if (lessonError || !lesson) throw new Error(`Failed to create lesson: ${lessonError?.message}`)

  // 7. Insert lesson_students — rollback lesson on failure
  const { error: lsError } = await db
    .from('lesson_students')
    .insert({ lesson_id: lesson.id, student_id: studentId, organization_id: orgId })
  if (lsError) {
    await db.from('lessons').delete().eq('id', lesson.id)
    throw new Error(`Failed to link student: ${lsError.message}`)
  }

  console.log('[createLesson] created', {
    org_id: orgId,
    lesson_id: lesson.id,
    teacher_id: teacherId,
    student_id: studentId,
    created_by: createdByProfileId,
  })

  return { lessonId: lesson.id, startAt: lesson.start_at, endAt: lesson.end_at }
}
