'use server'

/**
 * Server Actions for the booking WebView.
 * These are thin wrappers over lib/booking — they validate the JWT and delegate.
 * Per AGENTS.md: all booking writes via service role, server-side only.
 */

import { after } from 'next/server'
import { DateTime } from 'luxon'
import { verifyBookingToken, BookingTokenError } from '@/lib/jwt'
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
  WeeklyQuotaExceededError,
} from '@/lib/booking'
import { LessonConflictError } from '@/lib/lessons/createLesson'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendTextMessage } from '@/lib/whatsapp'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { recordParentConsent } from '@/lib/whatsapp/consent'
import { parseAppLocale, resolveRecipientLocale, toIntlLocale } from '@/lib/i18n/locale'

/**
 * Errors thrown inside Server Actions cross to the client as opaque generic
 * errors (Next.js masks messages in production), so the client cannot tell an
 * expired link apart from a transient failure. Read actions therefore return a
 * tagged result instead of throwing.
 */
export type BookingDataResult<T> =
  | { success: true; data: T }
  | { success: false; error: 'token_expired' | 'unknown' }

function isExpiredTokenError(err: unknown): boolean {
  return err instanceof BookingTokenError && err.reason === 'expired'
}

// ── Teacher list ───────────────────────────────────────────────────────────────

export interface Teacher {
  id: string
  display_name: string
}

export async function getTeachersAction(token: string): Promise<BookingDataResult<Teacher[]>> {
  try {
    const { organizationId } = await verifyBookingToken(token)
    const db = createServiceRoleClient()

    // teachers.display_name does not exist in schema — name comes from profiles.full_name
    const { data, error } = await db
      .from('teachers')
      .select('id, profiles(full_name)')
      .eq('organization_id', organizationId)
      .eq('is_active', true)

    if (error) throw new Error(`Failed to load teachers: ${error.message}`)

    const teachers = (data ?? []).map(t => {
      const profiles = t.profiles as unknown as { full_name: string } | null
      return {
        id: t.id,
        display_name: profiles?.full_name ?? '',
      }
    })
    return { success: true, data: teachers }
  } catch (err) {
    if (isExpiredTokenError(err)) return { success: false, error: 'token_expired' }
    console.error('[getTeachersAction]', err)
    return { success: false, error: 'unknown' }
  }
}

// ── Available slots ────────────────────────────────────────────────────────────

export async function getAvailableSlotsAction(
  token: string,
  teacherId: string,
  date: string,
  durationMinutes: number
): Promise<BookingDataResult<AvailableSlot[]>> {
  try {
    const { organizationId, studentId } = await verifyBookingToken(token)
    const slots = await getAvailableSlots({ teacherId, date, durationMinutes, organizationId, studentId })
    return { success: true, data: slots }
  } catch (err) {
    if (isExpiredTokenError(err)) return { success: false, error: 'token_expired' }
    console.error('[getAvailableSlotsAction]', err)
    return { success: false, error: 'unknown' }
  }
}

export async function getAvailabilitySummaryAction(
  token: string,
  teacherId: string,
  durationMinutes: number,
  weekStart?: string
): Promise<BookingDataResult<AvailabilitySummary>> {
  try {
    const { organizationId, studentId } = await verifyBookingToken(token)
    const summary = await getAvailabilitySummary({ teacherId, organizationId, durationMinutes, weekStart, studentId })
    return { success: true, data: summary }
  } catch (err) {
    if (isExpiredTokenError(err)) return { success: false, error: 'token_expired' }
    console.error('[getAvailabilitySummaryAction]', err)
    return { success: false, error: 'unknown' }
  }
}

// ── Slot lock ──────────────────────────────────────────────────────────────────

export type LockSlotResult =
  | { success: true; lock: SlotLock }
  | { success: false; error: 'unavailable' | 'quota_exceeded' | 'token_expired' | 'unknown' }

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
    if (err instanceof WeeklyQuotaExceededError) return { success: false, error: 'quota_exceeded' }
    if (err instanceof BookingTokenError) {
      // An invalid token is just as dead as an expired one for this flow
      return { success: false, error: 'token_expired' }
    }
    console.error('[lockSlotAction]', err)
    return { success: false, error: 'unknown' }
  }
}

// ── Confirm booking ────────────────────────────────────────────────────────────

export type ConfirmBookingActionResult =
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
        | 'token_expired'
        | 'unknown'
    }

export async function confirmBookingAction(
  token: string,
  lockId: string,
  teacherId: string,
  uiLocale?: string
): Promise<ConfirmBookingActionResult> {
  try {
    const { organizationId, parentId, studentId } = await verifyBookingToken(token)
    const db = createServiceRoleClient()

    const result = await confirmBooking({ lockId, studentId, teacherId, organizationId })

    // The confirm screen carries the terms + messaging line, so completing a
    // booking is direct consent from the parent. Never overwrites an earlier
    // record, and must not cost a confirmed booking if it fails.
    await recordParentConsent({ parentId, source: 'booking' }).catch((err) =>
      console.warn('[confirmBookingAction] Failed to record booking consent', { orgId: organizationId, parentId, err: String(err) })
    )

    // Sprint 1 flow step 12: send WhatsApp confirmation to parent.
    // A send failure must not roll back a confirmed booking, and the send must
    // run via after() — a plain fire-and-forget promise dies when Vercel
    // freezes the lambda right after the action's response.
    const sendWork = sendWhatsAppConfirmation(db, organizationId, parentId, teacherId, result.startAt, uiLocale).catch(err => {
      console.error('[confirmBookingAction] Failed to send WhatsApp confirmation', { orgId: organizationId, lessonId: result.lessonId, parentId, err })
    })
    try {
      after(sendWork)
    } catch {
      // Outside a Next.js request scope (vitest) after() throws — process inline.
      await sendWork
    }

    return { success: true, result }
  } catch (err) {
    if (err instanceof LockExpiredError) return { success: false, error: 'lock_expired' }
    if (err instanceof InactiveParticipantError) return { success: false, error: 'inactive_participant' }
    if (err instanceof NoPrimaryParentError) return { success: false, error: 'no_primary_parent' }
    if (err instanceof WeeklyQuotaExceededError) return { success: false, error: 'quota_exceeded' }
    if (err instanceof LessonConflictError) {
      return { success: false, error: err.reason === 'student_conflict' ? 'student_conflict' : 'slot_taken' }
    }
    if (err instanceof BookingTokenError) return { success: false, error: 'token_expired' }
    console.error('[confirmBookingAction]', err)
    return { success: false, error: 'unknown' }
  }
}

async function sendWhatsAppConfirmation(
  db: ReturnType<typeof createServiceRoleClient>,
  organizationId: string,
  parentId: string,
  teacherId: string,
  startAt: string,
  uiLocale?: string
): Promise<void> {
  const [parentResult, teacherResult, orgResult] = await Promise.all([
    db.from('parents').select('phone, preferred_locale').eq('id', parentId).eq('organization_id', organizationId).single(),
    db.from('teachers').select('profiles(full_name)').eq('id', teacherId).single(),
    db.from('organizations').select('whatsapp_phone_number_id, whatsapp_access_token, default_locale, timezone').eq('id', organizationId).single(),
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

  // The language the parent just booked in is a live signal, exactly like the
  // language of a WhatsApp message being answered — it outranks the stored
  // preference. No uiLocale (older clients) falls back to stored → org default.
  const locale = resolveRecipientLocale({
    stored: parentResult.data.preferred_locale as string | null,
    detected: uiLocale ? parseAppLocale(uiLocale) : null,
    orgDefault: orgData.default_locale as string | null,
  })
  const intlLocale = toIntlLocale(locale)

  // start_at is stored in UTC; the parent picked the slot in the org's
  // timezone, so the confirmation must show that same wall-clock time.
  const timezone = (orgData.timezone as string | null) ?? 'Asia/Jerusalem'
  const startLocal = DateTime.fromISO(startAt, { zone: 'utc' }).setZone(timezone).setLocale(intlLocale)
  const date = startLocal.toLocaleString({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const time = startLocal.toFormat('HH:mm')
  const body = await resolveTemplate(organizationId, 'booking_confirmation', {
    teacher_name: teacherName,
    date,
    time,
  }, locale)
  await sendTextMessage(phone, body, accessToken, phoneNumberId)
}
