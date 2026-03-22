/**
 * validateSlotLock — checks whether a slot lock is still active.
 * A lock is valid when: status = 'active' AND expires_at > now().
 * Per /docs/decisions.md #3.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type SlotLockValidationResult =
  | { valid: true; lock: { id: string; teacher_id: string; student_id: string | null; start_at: string; end_at: string; expires_at: string } }
  | { valid: false; reason: 'not_found' | 'expired' | 'consumed' }

export async function validateSlotLock(
  lockId: string,
  organizationId: string
): Promise<SlotLockValidationResult> {
  const db = createServiceRoleClient()

  const { data: lock, error } = await db
    .from('slot_locks')
    .select('id, teacher_id, student_id, start_at, end_at, expires_at, status')
    .eq('id', lockId)
    .eq('organization_id', organizationId)
    .single()

  if (error || !lock) return { valid: false, reason: 'not_found' }

  if (lock.status === 'consumed') return { valid: false, reason: 'consumed' }

  if (lock.status === 'expired' || new Date(lock.expires_at) <= new Date()) {
    return { valid: false, reason: 'expired' }
  }

  return { valid: true, lock }
}
