'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError } from '@/lib/i18n/actionErrors'

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
  const session = await getSession()

  if (session.role !== 'owner') {
    return { error: await commonError('noPermission') }
  }

  try {
    requireMutation(session)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'מצב תמיכה — קריאה בלבד' }
  }

  const parsed = RetentionSchema.safeParse({ retention_days: formData.get('retention_days') })
  if (!parsed.success) {
    return { error: 'ערך לא תקין' }
  }

  const days = parsed.data.retention_days === 'never' ? null : parseInt(parsed.data.retention_days, 10)

  const db = createServiceRoleClient()
  const { error: updateErr } = await db
    .from('organizations')
    .update({ data_retention_days: days })
    .eq('id', session.orgId)

  if (updateErr) {
    console.error('[settings/privacy] DB update failed', { orgId: session.orgId, error: updateErr.message })
    return { error: 'שגיאה בשמירה' }
  }

  revalidatePath('/settings/privacy')
  return { error: null, success: true }
}
