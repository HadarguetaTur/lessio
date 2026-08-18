'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

const RetentionSchema = z.object({
  retention_days: z.union([
    z.literal('90'),
    z.literal('180'),
    z.literal('365'),
    z.literal('never'),
  ]),
})

export type DataRetentionState = { error: string | null; success?: boolean }

export async function saveDataRetentionAction(
  _prev: DataRetentionState,
  formData: FormData
): Promise<DataRetentionState> {
  const t = await getTranslations()
  const session = await getSession()

  if (session.role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  try {
    requireMutation(session)
  } catch (err) {
    return { error: await commonError('supportModeReadOnly') }
  }

  const parsed = RetentionSchema.safeParse({ retention_days: formData.get('retention_days') })
  if (!parsed.success) {
    return { error: t('settings.privacyActions.errors.invalidValue') }
  }

  const days = parsed.data.retention_days === 'never' ? null : parseInt(parsed.data.retention_days, 10)

  const db = createServiceRoleClient()
  const { error: updateErr } = await db
    .from('organizations')
    .update({ data_retention_days: days })
    .eq('id', session.orgId)

  if (updateErr) {
    console.error('[settings/privacy] DB update failed', { orgId: session.orgId, error: updateErr.message })
    return { error: t('settings.privacyActions.errors.saveFailed') }
  }

  revalidatePath('/settings/privacy')
  return { error: null, success: true }
}
