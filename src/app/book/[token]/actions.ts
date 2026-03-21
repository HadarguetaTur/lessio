'use server'

/**
 * Server Actions for the booking WebView.
 * These are thin wrappers over lib/booking — they validate the JWT and delegate.
 * Per AGENTS.md: all booking writes via service role, server-side only.
 */

import { verifyBookingToken } from '@/lib/jwt'
import {
  getAvailableSlots,
  createSlotLock,
  confirmBooking,
  type AvailableSlot,
  type SlotLock,
  type ConfirmBookingResult,
  SlotUnavailableError,
  LockExpiredError,
  InactiveParticipantError,
  NoPrimaryParentError,
} from '@/lib/booking'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

// ── Teacher list ───────────────────────────────────────────────────────────────

export interface Teacher {
  id: string
  display_name: string
}

export async function getTeachersAction(token: string): Promise<Teacher[]> {
  const { organizationId } = await verifyBookingToken(token)
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('teachers')
    .select('id, display_name')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('display_name')

  if (error) throw new Error(`Failed to load teachers: ${error.message}`)
  return data ?? []
}

// ── Available slots ────────────────────────────────────────────────────────────

export async function getAvailableSlotsAction(
  token: string,
  teacherId: string,
  date: string,
  durationMinutes: number
): Promise<AvailableSlot[]> {
  const { organizationId } = await verifyBookingToken(token)
  return getAvailableSlots({ teacherId, date, durationMinutes, organizationId })
}

// ── Slot lock ──────────────────────────────────────────────────────────────────

export type LockSlotResult =
  | { success: true; lock: SlotLock }
  | { success: false; error: 'unavailable' | 'token_expired' | 'unknown' }

export async function lockSlotAction(
  token: string,
  teacherId: string,
  startAt: string,
  endAt: string
): Promise<LockSlotResult> {
  try {
    const { organizationId, studentId } = await verifyBookingToken(token)
    const lock = await createSlotLock({ teacherId, startAt, endAt, studentId, organizationId })
    return { success: true, lock }
  } catch (err) {
    if (err instanceof SlotUnavailableError) return { success: false, error: 'unavailable' }
    if (err instanceof Error && err.message.includes('expired')) {
      return { success: false, error: 'token_expired' }
    }
    return { success: false, error: 'unknown' }
  }
}

// ── Confirm booking ────────────────────────────────────────────────────────────

export type ConfirmBookingActionResult =
  | { success: true; result: ConfirmBookingResult }
  | { success: false; error: 'lock_expired' | 'inactive_participant' | 'no_primary_parent' | 'token_expired' | 'unknown' }

export async function confirmBookingAction(
  token: string,
  lockId: string,
  teacherId: string
): Promise<ConfirmBookingActionResult> {
  try {
    const { organizationId, studentId } = await verifyBookingToken(token)
    const result = await confirmBooking({ lockId, studentId, teacherId, organizationId })
    return { success: true, result }
  } catch (err) {
    if (err instanceof LockExpiredError) return { success: false, error: 'lock_expired' }
    if (err instanceof InactiveParticipantError) return { success: false, error: 'inactive_participant' }
    if (err instanceof NoPrimaryParentError) return { success: false, error: 'no_primary_parent' }
    if (err instanceof Error && err.message.includes('expired')) {
      return { success: false, error: 'token_expired' }
    }
    return { success: false, error: 'unknown' }
  }
}
