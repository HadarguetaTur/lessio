'use server'

/**
 * Server Actions for the booking WebView.
 * These are thin wrappers over lib/booking — they validate the JWT and delegate.
 * Per AGENTS.md: all booking writes via service role, server-side only.
 */

import { verifyBookingToken } from '@/lib/jwt'
import { decryptToken } from '@/lib/crypto'
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
} from '@/lib/booking'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendTextMessage } from '@/lib/whatsapp'
import { resolveTemplate } from '@/lib/whatsapp/templates'

// ── Teacher list ───────────────────────────────────────────────────────────────

export interface Teacher {
  id: string
  display_name: string
}

export async function getTeachersAction(token: string): Promise<Teacher[]> {
  const { organizationId } = await verifyBookingToken(token)
  const db = createServiceRoleClient()

  // teachers.display_name does not exist in schema — name comes from profiles.full_name
  const { data, error } = await db
    .from('teachers')
    .select('id, profiles(full_name)')
    .eq('organization_id', organizationId)
    .eq('is_active', true)

  if (error) throw new Error(`Failed to load teachers: ${error.message}`)

  return (data ?? []).map(t => {
    const profiles = t.profiles as unknown as { full_name: string } | null
    return {
      id: t.id,
      display_name: profiles?.full_name ?? '',
    }
  })
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

export async function getAvailabilitySummaryAction(
  token: string,
  teacherId: string,
  durationMinutes: number,
  weekStart?: string
): Promise<AvailabilitySummary> {
  const { organizationId } = await verifyBookingToken(token)
  return getAvailabilitySummary({ teacherId, organizationId, durationMinutes, weekStart })
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
    const { organizationId, parentId, studentId } = await verifyBookingToken(token)
    const db = createServiceRoleClient()

    const result = await confirmBooking({ lockId, studentId, teacherId, organizationId })

    // Sprint 1 flow step 12: send WhatsApp confirmation to parent
    // Fire-and-forget — a send failure must not roll back a confirmed booking
    sendWhatsAppConfirmation(db, organizationId, parentId, teacherId, result.startAt).catch(err => {
      console.error('[confirmBookingAction] Failed to send WhatsApp confirmation', { orgId: organizationId, lessonId: result.lessonId, parentId, err })
    })

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

async function sendWhatsAppConfirmation(
  db: ReturnType<typeof createServiceRoleClient>,
  organizationId: string,
  parentId: string,
  teacherId: string,
  startAt: string
): Promise<void> {
  const [parentResult, teacherResult, orgResult] = await Promise.all([
    db.from('parents').select('phone').eq('id', parentId).eq('organization_id', organizationId).single(),
    db.from('teachers').select('profiles(full_name)').eq('id', teacherId).single(),
    db.from('organizations').select('whatsapp_phone_number_id, whatsapp_access_token').eq('id', organizationId).single(),
  ])

  if (parentResult.error || !parentResult.data) {
    console.warn('[confirmBookingAction] Could not load parent for WhatsApp confirmation')
    return
  }
  if (teacherResult.error || !teacherResult.data) {
    console.warn('[confirmBookingAction] Could not load teacher for WhatsApp confirmation')
    return
  }

  const phone = parentResult.data.phone
  const profiles = teacherResult.data.profiles as unknown as { full_name: string } | null
  const teacherName = profiles?.full_name ?? ''
  const orgData = orgResult.data

  const encryptedToken = orgData?.whatsapp_access_token as string | null
  if (!encryptedToken || !orgData?.whatsapp_phone_number_id) {
    console.warn('[confirmBookingAction] Org WhatsApp not connected — skipping confirmation', { organizationId })
    return
  }

  let accessToken: string
  try {
    accessToken = decryptToken(encryptedToken)
  } catch {
    console.error('[confirmBookingAction] Failed to decrypt org access token — skipping confirmation', { organizationId })
    return
  }

  const phoneNumberId = orgData.whatsapp_phone_number_id as string

  const date = new Date(startAt).toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
  const time = new Date(startAt).toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  })
  const body = await resolveTemplate(organizationId, 'booking_confirmation', {
    teacher_name: teacherName,
    date,
    time,
  })
  await sendTextMessage(phone, body, accessToken, phoneNumberId)
}
