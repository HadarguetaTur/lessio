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
  })
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({ subscription_covered_lesson_types: parsed.data.covered_lesson_types })
    .eq('id', orgId)

  if (updateError) {
    console.error('[settings/billing-policy] DB update failed', { orgId, error: updateError.message })
    return { error: t('settings.billingPolicy.errors.saveFailed') }
  }

  revalidatePath('/settings/billing-policy')
  revalidatePath('/settings')
  return { error: null, success: true }
}
