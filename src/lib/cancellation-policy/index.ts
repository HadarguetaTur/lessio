import { createClient } from '@/lib/supabase/server'
import {
  COLLECTION_POLICY_COLUMNS,
  toCollectionPolicy,
  type CollectionPolicy,
  type CollectionPolicyRow,
} from './collection'

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
): Promise<(CancellationPolicy & CollectionPolicyRow) | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('cancellation_policies')
    .select(`id, notice_hours_full, notice_hours_partial, partial_charge_percent, ${COLLECTION_POLICY_COLUMNS}`)
    .eq('organization_id', organizationId)
    .single()

  return (data as (CancellationPolicy & CollectionPolicyRow) | null) ?? null
}

export async function getCancellationPolicyOrDefaults(
  organizationId: string
): Promise<{
  policy: CancellationPolicy | null
  values: Omit<CancellationPolicy, 'id'>
  /** No-show and punch-card settings (decision #46); defaults when unset. */
  collection: CollectionPolicy
}> {
  const policy = await getCancellationPolicy(organizationId)
  const values = policy
    ? {
        notice_hours_full: policy.notice_hours_full,
        notice_hours_partial: policy.notice_hours_partial,
        partial_charge_percent: policy.partial_charge_percent,
      }
    : DEFAULTS
  return { policy, values, collection: toCollectionPolicy(policy) }
}
