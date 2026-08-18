'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'

type ActionState = { error: string } | { success: true } | null

export async function updateCancellationPolicy(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner') {
    return { error: t('settings.cancellationPolicy.errors.ownerOnly') }
  }

  const notice_hours_full = parseInt(formData.get('notice_hours_full') as string, 10)
  const notice_hours_partial = parseInt(formData.get('notice_hours_partial') as string, 10)
  const partial_charge_percent = parseInt(formData.get('partial_charge_percent') as string, 10)

  if (isNaN(notice_hours_full) || notice_hours_full < 0) {
    return { error: t('settings.cancellationPolicy.errors.fullHoursPositive') }
  }
  if (isNaN(notice_hours_partial) || notice_hours_partial < 0) {
    return { error: t('settings.cancellationPolicy.errors.partialHoursPositive') }
  }
  if (notice_hours_partial >= notice_hours_full) {
    return { error: t('settings.cancellationPolicy.errors.partialLessThanFull') }
  }
  if (isNaN(partial_charge_percent) || partial_charge_percent < 0 || partial_charge_percent > 100) {
    return { error: t('settings.cancellationPolicy.errors.percentRange') }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('cancellation_policies').upsert(
    {
      organization_id: orgId,
      notice_hours_full,
      notice_hours_partial,
      partial_charge_percent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) return { error: t('settings.cancellationPolicy.errors.saveFailed') }

  revalidatePath('/settings/cancellation-policy')
  return { success: true }
}
