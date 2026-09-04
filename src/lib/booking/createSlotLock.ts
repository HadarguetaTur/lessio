/**
 * createSlotLock — reserves a slot for 5 minutes.
 * Per /docs/sprint-1-scope.md § Implement slot locking and /docs/decisions.md #3.
 *
 * Concurrent-safety: enforced by the unique partial index on
 * slot_locks(teacher_id, start_at) WHERE status = 'active'
 * (migration 20260321000003_slot_lock_unique.sql).
 * If two requests race, the second insert will get a unique-constraint violation
 * which we surface as SlotUnavailableError.
 *
 * Uses service role — never called from client components.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getEffectiveBreakMinutes } from '@/lib/scheduling/breaks'
import { getExternalBusyIntervals } from '@/lib/google-calendar/getExternalBusyIntervals'
import { assertWeeklyQuotaNotExceeded } from './weeklyQuota'

export class SlotUnavailableError extends Error {
  constructor() {
    super('Slot is no longer available')
    this.name = 'SlotUnavailableError'
  }
}

export interface CreateSlotLockParams {
  teacherId: string
  startAt: string     // UTC ISO string
  endAt: string       // UTC ISO string
  organizationId: string
  studentId?: string
}

export interface SlotLock {
  id: string
  teacher_id: string
  student_id: string | null
  start_at: string
  end_at: string
  expires_at: string
  status: string
}

export async function createSlotLock({
  teacherId,
  startAt,
  endAt,
  organizationId,
  studentId,
}: CreateSlotLockParams): Promise<SlotLock> {
  const db = createServiceRoleClient()

  // Fail fast when the student has already used up the week — no point holding
  // a slot they cannot confirm.
  if (studentId) {
    await assertWeeklyQuotaNotExceeded({
      studentId,
      organizationId,
      slotStartUtc: startAt,
    })
  }

  // Retire this teacher's expired locks first. The unique partial index keys on
  // (teacher_id, start_at) WHERE status = 'active' and ignores expires_at, so an
  // abandoned lock — nothing marks a lock expired unless the parent explicitly
  // backs out — would otherwise block that exact slot forever: the calendar
  // keeps offering it (its filter does respect expires_at) while every attempt
  // to lock it fails.
  await db
    .from('slot_locks')
    .update({ status: 'expired' })
    .eq('teacher_id', teacherId)
    .eq('status', 'active')
    .lte('expires_at', new Date().toISOString())

  // Re-validate availability immediately before inserting the lock, with the
  // same break the generator applied. Without it the two disagree: two parents
  // could take adjacent locks that the calendar would never have offered
  // together, and the teacher ends up with no gap between the lessons.
  const { breakMinutes } = await getEffectiveBreakMinutes(organizationId, teacherId)
  const isAvailable = await checkSlotAvailable(db, teacherId, startAt, endAt, breakMinutes)
  if (!isAvailable) throw new SlotUnavailableError()

  // Google Calendar re-check (decision #36): a calendar event created after the
  // slot list was rendered must not be lockable. This is the ONLY Google check
  // on the write path — confirmBooking deliberately does not repeat it, so an
  // external event created inside the lock's five minutes losing to the booking
  // is an accepted race, in the same spirit as the dashboard's soft-confirm.
  // Not break-widened, consistent with the listing. Fail-open on Google errors.
  const externalBusy = await getExternalBusyIntervals({
    orgId: organizationId,
    teacherId,
    windowStartUtc: startAt,
    windowEndUtc: endAt,
  })
  if (externalBusy.some(b => b.start < endAt && b.end > startAt)) {
    throw new SlotUnavailableError()
  }

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('slot_locks')
    .insert({
      organization_id: organizationId,
      teacher_id: teacherId,
      student_id: studentId ?? null,
      start_at: startAt,
      end_at: endAt,
      expires_at: expiresAt,
      status: 'active',
    })
    .select('id, teacher_id, student_id, start_at, end_at, expires_at, status')
    .single()

  if (error) {
    // Unique constraint violation → concurrent lock on the same slot
    if (error.code === '23505') throw new SlotUnavailableError()
    throw new Error(`Failed to create slot lock: ${error.message}`)
  }

  return data
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * `breakMinutes` widens the window the queries look at, so a lesson or lock
 * that merely sits too close counts as a collision — the same rule
 * getAvailableSlots applies when it decides what to offer.
 */
async function checkSlotAvailable(
  db: ReturnType<typeof import('@/lib/supabase/service-role').createServiceRoleClient>,
  teacherId: string,
  startAt: string,
  endAt: string,
  breakMinutes: number
): Promise<boolean> {
  const now = new Date().toISOString()

  const bufferedStart = DateTime.fromISO(startAt, { zone: 'utc' })
    .minus({ minutes: breakMinutes })
    .toISO()!
  const bufferedEnd = DateTime.fromISO(endAt, { zone: 'utc' })
    .plus({ minutes: breakMinutes })
    .toISO()!

  // Check for overlapping scheduled lessons
  const { data: lessons } = await db
    .from('lessons')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .lt('start_at', bufferedEnd)
    .gt('end_at', bufferedStart)

  if (lessons && lessons.length > 0) return false

  // Check for active (non-expired) overlapping slot locks
  const { data: locks } = await db
    .from('slot_locks')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('status', 'active')
    .gt('expires_at', now)
    .lt('start_at', bufferedEnd)
    .gt('end_at', bufferedStart)

  if (locks && locks.length > 0) return false

  return true
}
