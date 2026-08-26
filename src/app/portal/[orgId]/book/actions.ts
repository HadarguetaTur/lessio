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
} from '@/lib/booking'

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
  durationMinutes: number
): Promise<AvailableSlot[]> {
  await requirePortalSession(orgId)
  return getAvailableSlots({ teacherId, date, durationMinutes, organizationId: orgId })
}

export async function getPortalAvailabilitySummaryAction(
  orgId: string,
  teacherId: string,
  durationMinutes: number,
  weekStart?: string
): Promise<AvailabilitySummary> {
  await requirePortalSession(orgId)
  return getAvailabilitySummary({ teacherId, organizationId: orgId, durationMinutes, weekStart })
}

export async function portalLockSlotAction(
  orgId: string,
  teacherId: string,
  startAt: string,
  endAt: string,
  studentId: string
): Promise<SlotLock> {
  const session = await requirePortalSession(orgId)
  await assertOwnsStudent(orgId, session.parentId, studentId)

  return createSlotLock({
    teacherId,
    startAt,
    endAt,
    studentId,
    organizationId: orgId,
  })
}

export async function portalConfirmBookingAction(
  orgId: string,
  lockId: string,
  teacherId: string,
  studentId: string
): Promise<ConfirmBookingResult> {
  const session = await requirePortalSession(orgId)
  await assertOwnsStudent(orgId, session.parentId, studentId)

  const result = await confirmBooking({
    lockId,
    studentId,
    teacherId,
    organizationId: orgId,
  })

  // A lesson now exists; the schedule and the home page both list it.
  revalidatePath(`/portal/${orgId}/schedule`)
  revalidatePath(`/portal/${orgId}/home`)
  return result
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
