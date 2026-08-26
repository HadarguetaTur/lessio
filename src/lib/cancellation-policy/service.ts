import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { CancellationPolicy } from './index'

/**
 * The cancellation policy, read with the service-role client.
 *
 * `getCancellationPolicy` in ./index uses the Supabase Auth client, which has
 * no session on the parent portal (the portal authenticates with its own
 * httpOnly JWT cookie) or on the WhatsApp webhook. Both would silently read
 * `null` and conclude that cancelling is free, while the charge path — which
 * has always queried with the service role — bills the parent anyway.
 *
 * Anything that shows a parent what a cancellation will cost, and anything that
 * actually charges for one, must read the policy through here.
 */
export async function getCancellationPolicyServiceRole(
  organizationId: string
): Promise<CancellationPolicy | null> {
  const db = createServiceRoleClient()

  const { data } = await db
    .from('cancellation_policies')
    .select('id, notice_hours_full, notice_hours_partial, partial_charge_percent')
    .eq('organization_id', organizationId)
    .maybeSingle()

  return (data as CancellationPolicy | null) ?? null
}
