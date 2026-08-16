'use server'

import { redirect } from 'next/navigation'
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
  endAt: string
): Promise<SlotLock> {
  const session = await requirePortalSession(orgId)
  const db = createServiceRoleClient()

  // Resolve primary student for this parent
  const { data: rel } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()
  if (!rel) throw new Error('No student found for this parent')

  return createSlotLock({
    teacherId,
    startAt,
    endAt,
    studentId: rel.student_id,
    organizationId: orgId,
  })
}

export async function portalConfirmBookingAction(
  orgId: string,
  lockId: string,
  teacherId: string
): Promise<ConfirmBookingResult> {
  const session = await requirePortalSession(orgId)
  const db = createServiceRoleClient()

  const { data: rel } = await db
    .from('relationships')
    .select('student_id')
    .eq('parent_id', session.parentId)
    .eq('organization_id', orgId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()
  if (!rel) throw new Error('No student found for this parent')

  return confirmBooking({
    lockId,
    studentId: rel.student_id,
    teacherId,
    organizationId: orgId,
  })
}
