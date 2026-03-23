import { createClient } from '@/lib/supabase/server'

export interface CancellationPolicy {
  id: string
  notice_hours_full: number
  notice_hours_partial: number
  partial_charge_percent: number
}

const DEFAULTS: Omit<CancellationPolicy, 'id'> = {
  notice_hours_full: 24,
  notice_hours_partial: 2,
  partial_charge_percent: 50,
}

export async function getCancellationPolicy(
  organizationId: string
): Promise<CancellationPolicy | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('cancellation_policies')
    .select('id, notice_hours_full, notice_hours_partial, partial_charge_percent')
    .eq('organization_id', organizationId)
    .single()

  return data ?? null
}

export async function getCancellationPolicyOrDefaults(
  organizationId: string
): Promise<{ policy: CancellationPolicy | null; values: Omit<CancellationPolicy, 'id'> }> {
  const policy = await getCancellationPolicy(organizationId)
  const values = policy
    ? {
        notice_hours_full: policy.notice_hours_full,
        notice_hours_partial: policy.notice_hours_partial,
        partial_charge_percent: policy.partial_charge_percent,
      }
    : DEFAULTS
  return { policy, values }
}
