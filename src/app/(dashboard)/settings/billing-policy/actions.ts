'use server'

/**
 * Server actions for billing policy settings — the org-level rules that decide
 * what a student is actually charged for. Today: which lesson types an active
 * subscription covers.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

export type BillingPolicyActionState = {
  error: string | null
  success?: boolean
}

const BillingPolicySchema = z.object({
  // An empty set is valid: the subscription becomes a flat fee and every lesson is billed.
  covered_lesson_types: z.array(z.enum(['individual', 'pair', 'group', 'custom'])),
  billing_mode: z.enum(['monthly', 'per_lesson']),
  billing_cycle_start_day: z.coerce.number().int().min(1).max(28),
  billing_due_days: z.coerce.number().int().min(0).max(90),
})

export async function saveBillingPolicySettings(
  _prevState: BillingPolicyActionState,
  formData: FormData
): Promise<BillingPolicyActionState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: await commonError('ownerOnly') }
  }

  const parsed = BillingPolicySchema.safeParse({
    covered_lesson_types: formData.getAll('covered_lesson_types'),
    billing_mode: formData.get('billing_mode'),
    billing_cycle_start_day: formData.get('billing_cycle_start_day'),
    billing_due_days: formData.get('billing_due_days'),
  })
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const db = createServiceRoleClient()
  const { data: currentOrg } = await db
    .from('organizations')
    .select('billing_mode, billing_cycle_start_day')
    .eq('id', orgId)
    .single()

  if (currentOrg?.billing_mode && currentOrg.billing_mode !== parsed.data.billing_mode) {
    const conflictingTypes = parsed.data.billing_mode === 'monthly'
      ? ['lesson', 'cancellation']
      : ['monthly']
    const { count, error: conflictError } = await db
      .from('charges')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('charge_type', conflictingTypes)
      .in('status', ['pending', 'invoiced'])

    if (conflictError) {
      return { error: t('settings.billingPolicy.errors.saveFailed') }
    }
    if ((count ?? 0) > 0) {
      return { error: t('settings.billingPolicy.errors.modeChangeConflict') }
    }
  }

  if (
    currentOrg?.billing_cycle_start_day != null &&
    Number(currentOrg.billing_cycle_start_day) !== parsed.data.billing_cycle_start_day
  ) {
    const { count, error: draftError } = await db
      .from('student_monthly_billing')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('is_approved', false)

    if (draftError) return { error: t('settings.billingPolicy.errors.saveFailed') }
    if ((count ?? 0) > 0) {
      return { error: t('settings.billingPolicy.errors.cycleChangeConflict') }
    }
  }

  const { error: updateError } = await db
    .from('organizations')
    .update({
      subscription_covered_lesson_types: parsed.data.covered_lesson_types,
      billing_mode: parsed.data.billing_mode,
      billing_cycle_start_day: parsed.data.billing_cycle_start_day,
      billing_due_days: parsed.data.billing_due_days,
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[settings/billing-policy] DB update failed', { orgId, error: updateError.message })
    return { error: t('settings.billingPolicy.errors.saveFailed') }
  }

  revalidatePath('/settings/billing-policy')
  revalidatePath('/settings')
  return { error: null, success: true }
}
