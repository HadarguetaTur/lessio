'use server'

/**
 * Server actions for exam policy settings — what happens when a parent or
 * student reports an exam (notify / one-click approve / auto quota bump,
 * plus the booster-lesson offer).
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

export type ExamPolicyActionState = {
  error: string | null
  success?: boolean
}

const ExamPolicySchema = z.object({
  exam_policy_mode: z.enum(['notify', 'approve', 'auto']),
  exam_quota_bump: z.coerce.number().int().min(1).max(5),
  exam_offer_booster: z.boolean(),
})

export async function saveExamPolicySettings(
  _prevState: ExamPolicyActionState,
  formData: FormData
): Promise<ExamPolicyActionState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const raw = {
    exam_policy_mode: formData.get('exam_policy_mode'),
    exam_quota_bump: formData.get('exam_quota_bump'),
    // An unchecked checkbox submits nothing — 'on' is the only truthy form.
    exam_offer_booster: formData.get('exam_offer_booster') === 'on',
  }

  const parsed = ExamPolicySchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({
      exam_policy_mode: parsed.data.exam_policy_mode,
      exam_quota_bump: parsed.data.exam_quota_bump,
      exam_offer_booster: parsed.data.exam_offer_booster,
    })
    .eq('id', orgId)

  if (updateError) {
    console.error('[settings/exams] DB update failed', { orgId, error: updateError.message })
    return { error: t('settings.exams.errors.saveFailed') }
  }

  revalidatePath('/settings/exams')
  revalidatePath('/settings')
  return { error: null, success: true }
}
