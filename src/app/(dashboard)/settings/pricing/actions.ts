'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const PricingSchema = z.object({
  // Empty means "no org default" — teachers with their own rate still bill fine.
  default_individual_hourly_rate: z.coerce.number().positive().max(10000).nullable(),
  pair_price_per_student: z.coerce.number().positive().max(10000),
  group_price_per_student: z.coerce.number().positive().max(10000),
})

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const raw = (value as string | null)?.trim()
  return raw ? Number(raw) : null
}

export async function savePricingAction(
  formData: FormData
): Promise<{ error: string | null }> {
  const session = await getSession()

  if (session.role !== 'owner') {
    return { error: 'Unauthorized — owner only' }
  }

  try {
    requireMutation(session)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Support mode — read only' }
  }

  const parsed = PricingSchema.safeParse({
    default_individual_hourly_rate: optionalNumber(
      formData.get('default_individual_hourly_rate')
    ),
    pair_price_per_student: formData.get('pair_price_per_student'),
    group_price_per_student: formData.get('group_price_per_student'),
  })

  if (!parsed.success) {
    return { error: 'Invalid input' }
  }

  const db = createServiceRoleClient()
  const { error: updateErr } = await db
    .from('organizations')
    .update({
      default_individual_hourly_rate: parsed.data.default_individual_hourly_rate,
      pair_price_per_student: parsed.data.pair_price_per_student,
      group_price_per_student: parsed.data.group_price_per_student,
    })
    .eq('id', session.orgId)

  if (updateErr) {
    console.error('[settings/pricing] DB update failed', {
      orgId: session.orgId,
      error: updateErr.message,
    })
    return { error: 'Failed to save' }
  }

  revalidatePath('/settings/pricing')
  revalidatePath('/billing')
  revalidatePath('/lessons/new')
  return { error: null }
}
