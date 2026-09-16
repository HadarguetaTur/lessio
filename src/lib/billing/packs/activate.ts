/**
 * Activation on payment (decision #46, pack_activation = 'on_payment').
 *
 * Called from every place a charge becomes paid — `markChargeAsPaid` and the
 * payment webhook. Idempotent: only a pack still waiting (activated_at IS NULL)
 * and not cancelled is touched, so a redelivered callback does nothing.
 *
 * There is no retroactive punching: lessons completed while the pack waited
 * were priced in money and stay that way.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function activatePacksForCharges(chargeIds: readonly string[]): Promise<string[]> {
  if (chargeIds.length === 0) return []
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('lesson_packs')
    .update({ activated_at: new Date().toISOString() })
    .in('charge_id', chargeIds as string[])
    .is('activated_at', null)
    .is('cancelled_at', null)
    .select('id')
  if (error) {
    // The payment is recorded either way; a pack left waiting is visible on
    // /packs and fixed by re-running this, so log instead of failing the payment.
    console.error('[packs/activate] activation failed', { chargeIds, error: error.message })
    return []
  }
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
}
