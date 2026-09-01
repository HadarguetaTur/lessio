'use server'

/**
 * Server actions for scheduling settings — the default break between lessons,
 * how far ahead a parent must book, and whether teachers are asked what to do
 * with unbookable leftover time at the end of a day.
 *
 * The first two columns have existed since Sprint 1 but were only reachable
 * from the superadmin console; this is the first owner-facing surface for them.
 * The ranges below deliberately mirror the ones that console enforces
 * (src/app/(admin)/admin/orgs/actions.ts) so the two screens cannot disagree.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

export type SchedulingActionState = {
  error: string | null
  success?: boolean
}

const SchedulingSchema = z.object({
  break_duration_minutes: z.coerce.number().int().min(0).max(120),
  min_booking_notice_hours: z.coerce.number().int().min(0).max(168),
  tail_prompt_enabled: z.boolean(),
})

export async function saveSchedulingSettings(
  _prevState: SchedulingActionState,
  formData: FormData
): Promise<SchedulingActionState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const raw = {
    break_duration_minutes: formData.get('break_duration_minutes'),
    min_booking_notice_hours: formData.get('min_booking_notice_hours'),
    // An unchecked checkbox submits nothing — 'on' is the only truthy form.
    tail_prompt_enabled: formData.get('tail_prompt_enabled') === 'on',
  }

  const parsed = SchedulingSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({
      break_duration_minutes: parsed.data.break_duration_minutes,
      min_booking_notice_hours: parsed.data.min_booking_notice_hours,
      tail_prompt_enabled: parsed.data.tail_prompt_enabled,
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[settings/scheduling] DB update failed', { orgId, error: updateError.message })
    return { error: t('settings.scheduling.errors.saveFailed') }
  }

  revalidatePath('/settings/scheduling')
  revalidatePath('/settings')
  return { error: null, success: true }
}
