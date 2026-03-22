/**
 * confirmBooking — creates a lesson from a confirmed slot lock.
 * Per /docs/sprint-1-scope.md § Create lesson from confirmed booking.
 *
 * Steps:
 *  1. Validate the lock is still active
 *  2. Validate teacher + student are active in the org
 *  3. Resolve billing parent (is_primary = true from relationships)
 *  4. Create lesson (status: 'scheduled') via service role
 *  5. Mark slot lock as 'consumed'
 *
 * Uses service role — never called from client components.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { validateSlotLock } from './validateSlotLock'

export class LockExpiredError extends Error {
  constructor(reason: string) {
    super(`Slot lock is no longer valid: ${reason}`)
    this.name = 'LockExpiredError'
  }
}

export class InactiveParticipantError extends Error {
  constructor(participant: 'teacher' | 'student') {
    super(`${participant} is not active in this organization`)
    this.name = 'InactiveParticipantError'
  }
}

export class NoPrimaryParentError extends Error {
  constructor() {
    super('Student has no primary parent — lesson cannot be created')
    this.name = 'NoPrimaryParentError'
  }
}

export interface ConfirmBookingParams {
  lockId: string
  studentId: string
  teacherId: string
  organizationId: string
}

export interface ConfirmBookingResult {
  lessonId: string
  teacherId: string
  studentId: string
  startAt: string
  endAt: string
}

export async function confirmBooking({
  lockId,
  studentId,
  teacherId,
  organizationId,
}: ConfirmBookingParams): Promise<ConfirmBookingResult> {
  const db = createServiceRoleClient()

  // 1. Validate lock
  const lockResult = await validateSlotLock(lockId, organizationId)
  if (!lockResult.valid) throw new LockExpiredError(lockResult.reason)

  const { lock } = lockResult

  // 2. Validate teacher is active in org
  const { data: teacher, error: teacherError } = await db
    .from('teachers')
    .select('id, is_active')
    .eq('id', teacherId)
    .eq('organization_id', organizationId)
    .single()

  if (teacherError || !teacher || !teacher.is_active) {
    throw new InactiveParticipantError('teacher')
  }

  // 3. Validate student is active in org
  const { data: student, error: studentError } = await db
    .from('students')
    .select('id, is_active')
    .eq('id', studentId)
    .eq('organization_id', organizationId)
    .single()

  if (studentError || !student || !student.is_active) {
    throw new InactiveParticipantError('student')
  }

  // 4. Resolve billing parent (is_primary = true)
  // Per /docs/decisions.md #10 and /docs/schema.md § relationships
  const { data: relationship } = await db
    .from('relationships')
    .select('parent_id')
    .eq('student_id', studentId)
    .eq('organization_id', organizationId)
    .eq('is_primary', true)
    .maybeSingle()

  if (!relationship) throw new NoPrimaryParentError()

  // 5. Create lesson
  const { data: lesson, error: lessonError } = await db
    .from('lessons')
    .insert({
      organization_id: organizationId,
      teacher_id: teacherId,
      student_id: studentId,
      start_at: lock.start_at,
      end_at: lock.end_at,
      status: 'scheduled',
    })
    .select('id, teacher_id, student_id, start_at, end_at')
    .single()

  if (lessonError || !lesson) {
    throw new Error(`Failed to create lesson: ${lessonError?.message}`)
  }

  // 6. Mark slot lock as consumed
  await db
    .from('slot_locks')
    .update({ status: 'consumed' })
    .eq('id', lockId)
    .eq('organization_id', organizationId)

  return {
    lessonId: lesson.id,
    teacherId: lesson.teacher_id,
    studentId: lesson.student_id,
    startAt: lesson.start_at,
    endAt: lesson.end_at,
  }
}
