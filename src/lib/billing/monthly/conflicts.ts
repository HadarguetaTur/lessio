import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import { getOrgTimezone } from '@/lib/organizations'

export class MonthlyBillingConflictError extends Error {
  constructor(public readonly conflictingChargeIds: string[]) {
    super('Monthly billing contains lessons that already have individual charges')
    this.name = 'MonthlyBillingConflictError'
  }
}

/**
 * Final safety gate before a monthly ledger charge is created. Historical and
 * alternate write paths may already have created lesson/cancellation charges;
 * those records must be reviewed, never silently folded into another demand.
 */
export async function assertMonthlyBillingHasNoIndividualChargeConflicts(
  organizationId: string,
  billingRecordId: string
): Promise<void> {
  const db = createServiceRoleClient()
  const { data: billing, error: billingError } = await db
    .from('student_monthly_billing')
    .select('student_id, period_start, period_end')
    .eq('id', billingRecordId)
    .eq('organization_id', organizationId)
    .single()

  if (billingError || !billing) {
    throw new Error(`[monthlyBillingConflict] billing lookup failed: ${billingError?.message ?? 'missing row'}`)
  }

  const timezone = await getOrgTimezone(organizationId)
  const start = DateTime.fromISO(billing.period_start as string, { zone: timezone }).startOf('day')
  const endExclusive = DateTime.fromISO(billing.period_end as string, { zone: timezone })
    .plus({ days: 1 })
    .startOf('day')

  const { data: lessonRows, error: lessonError } = await db
    .from('lesson_students')
    .select('lesson_id, lessons!inner(start_at)')
    .eq('organization_id', organizationId)
    .eq('student_id', billing.student_id)
    .gte('lessons.start_at', start.toUTC().toISO()!)
    .lt('lessons.start_at', endExclusive.toUTC().toISO()!)

  if (lessonError) {
    throw new Error(`[monthlyBillingConflict] lesson lookup failed: ${lessonError.message}`)
  }

  const lessonIds = (lessonRows ?? []).map((row) => row.lesson_id as string)
  if (lessonIds.length === 0) return

  const { data: charges, error: chargeError } = await db
    .from('charges')
    .select('id')
    .eq('organization_id', organizationId)
    .in('lesson_id', lessonIds)
    .in('charge_type', ['lesson', 'cancellation'])
    .in('status', ['pending', 'invoiced', 'paid'])

  if (chargeError) {
    throw new Error(`[monthlyBillingConflict] charge lookup failed: ${chargeError.message}`)
  }

  const ids = (charges ?? []).map((charge) => charge.id as string)
  if (ids.length > 0) throw new MonthlyBillingConflictError(ids)
}
