/**
 * The single entry for recording how a lesson went (decision #46).
 *
 * Writes per-student attendance, moves the lesson status only when it changes,
 * and then hands the money to `settleLessonOutcome`. `updateLessonStatus` is an
 * implementation detail of this function for delivered outcomes — a caller that
 * flips the status by itself skips attendance and the reconciler.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { ChargeAlert } from '@/lib/billing/createCharge'
import { settleLessonOutcome } from '@/lib/billing/outcome/settleLessonOutcome'
import { updateLessonStatus } from './index'
import { normalizeOutcome, type Attendance, type DeliveredStatus } from './attendance'

export interface RecordLessonOutcomeResult {
  status: DeliveredStatus
  chargeAlert: ChargeAlert | null
}

export async function recordLessonOutcome(params: {
  lessonId: string
  organizationId: string
  status: DeliveredStatus
  /** Explicit "who came" list from a form. Null/undefined = no list submitted. */
  presentStudentIds?: readonly string[] | null
  confirmation?: { profileId: string; source: 'teacher' | 'staff' }
  actorProfileId?: string | null
  onPackConsumed?: (packId: string) => void
}): Promise<RecordLessonOutcomeResult> {
  const { lessonId, organizationId } = params
  const db = createServiceRoleClient()

  const { data: lesson, error } = await db
    .from('lessons')
    .select('status, lesson_students(student_id)')
    .eq('id', lessonId)
    .eq('organization_id', organizationId)
    .single()
  if (error || !lesson) throw new Error('validation.lessonNotFound')

  const rosterStudentIds = ((lesson.lesson_students as unknown as Array<{ student_id: string }>) ?? []).map(
    (row) => row.student_id
  )
  const normalized = normalizeOutcome({
    status: params.status,
    rosterStudentIds,
    presentStudentIds: params.presentStudentIds,
  })

  // Status first: an illegal transition throws before any attendance is written.
  if (lesson.status !== normalized.status) {
    await updateLessonStatus(
      lessonId,
      organizationId,
      normalized.status,
      normalized.status === 'completed' ? params.confirmation : undefined
    )
  }

  const now = new Date().toISOString()
  if (normalized.attendance) {
    const byValue = new Map<Attendance, string[]>()
    for (const [studentId, value] of normalized.attendance) {
      byValue.set(value, [...(byValue.get(value) ?? []), studentId])
    }
    for (const [value, studentIds] of byValue) {
      const { error: writeError } = await db
        .from('lesson_students')
        .update({ attendance: value, attendance_recorded_at: now })
        .eq('lesson_id', lessonId)
        .in('student_id', studentIds)
      if (writeError) throw new Error(`[recordLessonOutcome] attendance write failed: ${writeError.message}`)
    }
  } else if (normalized.status === 'completed' && lesson.status === 'no_show') {
    // Correcting a no-show to "completed" without a list means everyone came.
    const { error: clearError } = await db
      .from('lesson_students')
      .update({ attendance: null, attendance_recorded_at: null })
      .eq('lesson_id', lessonId)
      .eq('attendance', 'absent')
    if (clearError) throw new Error(`[recordLessonOutcome] attendance reset failed: ${clearError.message}`)
  }

  const chargeAlert = await settleLessonOutcome(lessonId, organizationId, {
    actorProfileId: params.actorProfileId ?? null,
    onPackConsumed: params.onPackConsumed,
  })
  return { status: normalized.status, chargeAlert }
}
