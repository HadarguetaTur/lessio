import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type BillingMode = 'monthly' | 'per_lesson'

export interface OrgBillingPolicy {
  billingMode: BillingMode
  cycleStartDay: number
  dueDays: number
}

export async function getOrgBillingPolicy(organizationId: string): Promise<OrgBillingPolicy> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('organizations')
    .select('billing_mode, billing_cycle_start_day, billing_due_days')
    .eq('id', organizationId)
    .single()

  if (error || !data) {
    throw new Error(`[getOrgBillingPolicy] organization lookup failed: ${error?.message ?? 'missing row'}`)
  }

  return {
    billingMode: data.billing_mode === 'per_lesson' ? 'per_lesson' : 'monthly',
    cycleStartDay: Number(data.billing_cycle_start_day ?? 1),
    dueDays: Number(data.billing_due_days ?? 7),
  }
}
