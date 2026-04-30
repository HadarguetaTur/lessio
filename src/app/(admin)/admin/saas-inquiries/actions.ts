'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireSuperAdminSession } from '@/lib/superadmin/session'
import { getSaasPlanByName } from '@/lib/saas/plans'
import { markOrganizationOnboardingComplete } from '@/lib/saas/subscriptions'

const idSchema = z.string().uuid()

export async function resolveSaasPlanInquiryAction(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  await requireSuperAdminSession()
  const id = idSchema.safeParse(formData.get('inquiry_id'))
  if (!id.success) return { error: 'Invalid inquiry' }

  const db = createServiceRoleClient()
  const { data: row, error: fetchErr } = await db
    .from('saas_plan_inquiries')
    .select('organization_id, status')
    .eq('id', id.data)
    .single()

  if (fetchErr || !row || row.status !== 'open') return { error: 'Inquiry not found' }

  const customPlan = await getSaasPlanByName('custom')
  if (!customPlan) return { error: 'Custom plan missing in DB' }

  const periodEnd = new Date()
  periodEnd.setMonth(periodEnd.getMonth() + 1)

  const { error: upSub } = await db.from('organization_subscriptions').upsert(
    {
      organization_id: row.organization_id,
      plan_id: customPlan.id,
      status: 'active',
      billing_interval: 'monthly',
      trial_ends_at: null,
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
      pending_checkout_reference: null,
    },
    { onConflict: 'organization_id' }
  )

  if (upSub) return { error: upSub.message }

  const { error: upInq } = await db
    .from('saas_plan_inquiries')
    .update({ status: 'resolved' })
    .eq('id', id.data)

  if (upInq) return { error: upInq.message }

  await markOrganizationOnboardingComplete(row.organization_id)

  revalidatePath('/admin/saas-inquiries')
  revalidatePath('/admin/orgs')
  return null
}
