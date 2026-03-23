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

import { createServiceRoleClient } from '@/lib/supabase/service-role'

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

  // Re-validate availability immediately before inserting the lock
  const isAvailable = await checkSlotAvailable(db, teacherId, startAt, endAt)
  if (!isAvailable) throw new SlotUnavailableError()

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

async function checkSlotAvailable(
  db: ReturnType<typeof import('@/lib/supabase/service-role').createServiceRoleClient>,
  teacherId: string,
  startAt: string,
  endAt: string
): Promise<boolean> {
  const now = new Date().toISOString()

  // Check for overlapping scheduled lessons
  const { data: lessons } = await db
    .from('lessons')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('status', 'scheduled')
    .lt('start_at', endAt)
    .gt('end_at', startAt)

  if (lessons && lessons.length > 0) return false

  // Check for active (non-expired) overlapping slot locks
  const { data: locks } = await db
    .from('slot_locks')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('status', 'active')
    .gt('expires_at', now)
    .lt('start_at', endAt)
    .gt('end_at', startAt)

  if (locks && locks.length > 0) return false

  return true
}
