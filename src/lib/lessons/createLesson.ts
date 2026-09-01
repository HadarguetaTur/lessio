import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { assertOrgNotSaasReadOnly } from '@/lib/saas/subscriptions'
import { detectDayTail } from '@/lib/scheduling/dayTail'
import type { LessonStatus, LessonType } from '@/lib/lessons/types'

export type CreateLessonParams = {
  orgId: string
  teacherId: string
  /** One or more student IDs (1 for individual, multiple for pair/group/custom) */
  studentIds: string[]
  lessonType?: LessonType
  date: string            // YYYY-MM-DD in org timezone
  startTime: string       // HH:MM in org timezone
  durationMinutes: number
  createdByProfileId: string
  /** Defaults to scheduled when omitted (e.g. teacher quick-create). */
  status?: LessonStatus
  /**
   * Per-student price. Optional override for pair/group (falls back to the org
   * default); required for custom lessons, which have no org default.
   */
  pricePerStudent?: number | null
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
 * Supports individual, pair, group and custom lesson types via studentIds array.
 * Validation rules:
 *   - holiday block
 *   - teacher overlap (non-cancelled lessons)
 *   - student overlap (via lesson_students junction) for each student
 */
export async function createLesson(
  params: CreateLessonParams
): Promise<CreateLessonResult> {
  const {
    orgId,
    teacherId,
    studentIds,
    lessonType = 'individual',
    date,
    startTime,
    durationMinutes,
    createdByProfileId,
    status: lessonStatus,
    pricePerStudent,
  } = params

  const status: LessonStatus = lessonStatus ?? 'scheduled'

  if (studentIds.length === 0) throw new Error('At least one student is required')

  await assertOrgNotSaasReadOnly(orgId)

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

  // 4b. Active slot_lock check — prevent scheduling over a slot a parent is currently holding
  const { data: lockConflict } = await db
    .from('slot_locks')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .lt('start_at', endUtc)
    .gt('end_at', startUtc)
    .limit(1)
  if (lockConflict?.length) throw new LessonConflictError('teacher_conflict')

  // 5. Student overlap check via lesson_students for each student
  for (const studentId of studentIds) {
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
  }

  // 6. Insert lesson
  const insertPayload: Record<string, unknown> = {
    organization_id: orgId,
    teacher_id: teacherId,
    start_at: startUtc,
    end_at: endUtc,
    status,
    lesson_type: lessonType,
    max_students: studentIds.length,
  }
  if (pricePerStudent != null) insertPayload.price_per_student = pricePerStudent
  const { data: lesson, error: lessonError } = await db
    .from('lessons')
    .insert(insertPayload)
    .select('id, start_at, end_at')
    .single()
  if (lessonError || !lesson) throw new Error(`Failed to create lesson: ${lessonError?.message}`)

  // 7. Insert lesson_students — rollback lesson on failure
  const lessonStudentsRows = studentIds.map((sid) => ({
    lesson_id: lesson.id,
    student_id: sid,
    organization_id: orgId,
  }))
  const { error: lsError } = await db.from('lesson_students').insert(lessonStudentsRows)
  if (lsError) {
    await db.from('lessons').delete().eq('id', lesson.id)
    throw new Error(`Failed to link students: ${lsError.message}`)
  }

  console.log('[createLesson] created', {
    org_id: orgId,
    lesson_id: lesson.id,
    lesson_type: lessonType,
    teacher_id: teacherId,
    student_ids: studentIds,
    created_by: createdByProfileId,
  })

  // A lesson placed late in the day can leave a remainder too short to sell.
  // Only scheduled lessons occupy the calendar, so only they can strand time.
  // Swallows its own errors — the lesson is already created.
  if (status === 'scheduled') {
    await detectDayTail({ organizationId: orgId, teacherId, startAtUtc: lesson.start_at })
  }

  return { lessonId: lesson.id, startAt: lesson.start_at, endAt: lesson.end_at }
}
