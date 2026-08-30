'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getPortalSession } from '@/lib/portal/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  getAvailableSlots,
  getAvailabilitySummary,
  createSlotLock,
  confirmBooking,
  type AvailableSlot,
  type AvailabilitySummary,
  type SlotLock,
  type ConfirmBookingResult,
  SlotUnavailableError,
  LockExpiredError,
  InactiveParticipantError,
  NoPrimaryParentError,
  WeeklyQuotaExceededError,
} from '@/lib/booking'
import { LessonConflictError } from '@/lib/lessons/createLesson'

async function requirePortalSession(orgId: string) {
  const session = await getPortalSession()
  // Bounce to login like every portal page does. Throwing here sent a parent whose
  // 7-day session had simply expired to the generic error page instead.
  // redirect() must stay outside any try/catch — it signals by throwing.
  if (!session || session.orgId !== orgId) {
    redirect(`/portal/${orgId}/login`)
  }
  return session
}

export interface PortalTeacher {
  id: string
  display_name: string
}

export interface PortalStudent {
  id: string
  full_name: string
}

/**
 * The parent's children, for the picker at the top of the booking flow.
 *
 * The flow used to pick whichever relationship carried `is_primary` — which
 * flags the primary *payer*, not "the child" — so a parent with two children
 * silently booked for one of them without ever being asked which.
 */
export async function getPortalStudentsAction(orgId: string): Promise<PortalStudent[]> {
  const session = await requirePortalSession(orgId)
  const db = createServiceRoleClient()
  const { data } = await db
    .from('relationships')
    .select('student_id, students ( full_name, is_active )')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)

  type Row = { student_id: string; students: { full_name: string; is_active: boolean } | null }
  return (data ?? [])
    .map((r) => r as unknown as Row)
    .filter((r) => r.students?.is_active)
    .map((r) => ({ id: r.student_id, full_name: r.students?.full_name ?? '' }))
}

/** Confirms the student is one of this parent's children before it is used. */
async function assertOwnsStudent(orgId: string, parentId: string, studentId: string) {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('relationships')
    .select('id')
    .eq('parent_id', parentId)
    .eq('organization_id', orgId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (!data) throw new Error('student_not_owned')
}

export async function getPortalTeachersAction(orgId: string): Promise<PortalTeacher[]> {
  await requirePortalSession(orgId)
  const db = createServiceRoleClient()
  const { data } = await db
    .from('teachers')
    .select('id, profiles(full_name)')
    .eq('organization_id', orgId)
    .eq('is_active', true)
  return (data ?? []).map((t) => ({
    id: t.id,
    display_name: (t.profiles as unknown as { full_name: string })?.full_name ?? '',
  }))
}

export async function getPortalSlotsAction(
  orgId: string,
  teacherId: string,
  date: string,
  durationMinutes: number,
  studentId?: string
): Promise<AvailableSlot[]> {
  const session = await requirePortalSession(orgId)
  if (studentId) await assertOwnsStudent(orgId, session.parentId, studentId)
  return getAvailableSlots({ teacherId, date, durationMinutes, organizationId: orgId, studentId })
}

export async function getPortalAvailabilitySummaryAction(
  orgId: string,
  teacherId: string,
  durationMinutes: number,
  weekStart?: string,
  studentId?: string
): Promise<AvailabilitySummary> {
  const session = await requirePortalSession(orgId)
  if (studentId) await assertOwnsStudent(orgId, session.parentId, studentId)
  return getAvailabilitySummary({ teacherId, organizationId: orgId, durationMinutes, weekStart, studentId })
}

/**
 * Booking failures reach the client through these tagged results rather than as
 * thrown errors: Next.js masks Server Action error messages in production, so a
 * quota block and a network blip arrived at the portal indistinguishable.
 */
export type PortalLockSlotResult =
  | { success: true; lock: SlotLock }
  | { success: false; error: 'unavailable' | 'quota_exceeded' | 'unknown' }

export async function portalLockSlotAction(
  orgId: string,
  teacherId: string,
  startAt: string,
  endAt: string,
  studentId: string
): Promise<PortalLockSlotResult> {
  const session = await requirePortalSession(orgId)
  // Deliberately outside the catch: booking for someone else's child is not a
  // booking outcome to render, it is a request that should never have arrived.
  await assertOwnsStudent(orgId, session.parentId, studentId)

  try {
    const lock = await createSlotLock({
      teacherId,
      startAt,
      endAt,
      studentId,
      organizationId: orgId,
    })
    return { success: true, lock }
  } catch (err) {
    if (err instanceof SlotUnavailableError) return { success: false, error: 'unavailable' }
    if (err instanceof WeeklyQuotaExceededError) return { success: false, error: 'quota_exceeded' }
    console.error('[portalLockSlotAction]', err)
    return { success: false, error: 'unknown' }
  }
}

export type PortalConfirmBookingResult =
  | { success: true; result: ConfirmBookingResult }
  | {
      success: false
      error:
        | 'lock_expired'
        | 'inactive_participant'
        | 'no_primary_parent'
        | 'quota_exceeded'
        | 'slot_taken'
        | 'student_conflict'
        | 'unknown'
    }

export async function portalConfirmBookingAction(
  orgId: string,
  lockId: string,
  teacherId: string,
  studentId: string
): Promise<PortalConfirmBookingResult> {
  const session = await requirePortalSession(orgId)
  await assertOwnsStudent(orgId, session.parentId, studentId)

  let result: ConfirmBookingResult
  try {
    result = await confirmBooking({
      lockId,
      studentId,
      teacherId,
      organizationId: orgId,
    })
  } catch (err) {
    if (err instanceof LockExpiredError) return { success: false, error: 'lock_expired' }
    if (err instanceof InactiveParticipantError) return { success: false, error: 'inactive_participant' }
    if (err instanceof NoPrimaryParentError) return { success: false, error: 'no_primary_parent' }
    if (err instanceof WeeklyQuotaExceededError) return { success: false, error: 'quota_exceeded' }
    if (err instanceof LessonConflictError) {
      return { success: false, error: err.reason === 'student_conflict' ? 'student_conflict' : 'slot_taken' }
    }
    console.error('[portalConfirmBookingAction]', err)
    return { success: false, error: 'unknown' }
  }

  // A lesson now exists; the schedule and the home page both list it.
  revalidatePath(`/portal/${orgId}/schedule`)
  revalidatePath(`/portal/${orgId}/home`)
  return { success: true, result }
}

/**
 * Releases a slot the parent decided not to take. Without this, backing out of
 * the confirmation step leaves the lock active for its full five minutes and
 * the slot they were just holding is missing from the list they return to.
 */
export async function portalReleaseSlotLockAction(orgId: string, lockId: string): Promise<void> {
  await requirePortalSession(orgId)
  const db = createServiceRoleClient()
  await db
    .from('slot_locks')
    .update({ status: 'expired' })
    .eq('id', lockId)
    .eq('organization_id', orgId)
    .eq('status', 'active')
}
