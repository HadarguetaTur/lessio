'use server'

/**
 * Server action for the parent-portal settings page — what an org opens to
 * parents in `/portal/[orgId]`.
 *
 * The whole set is written as one jsonb object rather than a column per
 * feature (decision #31 shape). Absent keys mean "on", so the write is always
 * explicit and complete: normalizePortalSettings on the read side then never
 * has to guess whether a missing key is a new feature or a switched-off one.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { PORTAL_FEATURES, type PortalSettings } from '@/lib/organizations/portalSettings'

export type ParentPortalActionState = {
  error: string | null
  success?: boolean
}

/** An unchecked checkbox submits nothing; 'on' is the only truthy form. */
const Toggle = z
  .union([z.literal('on'), z.null()])
  .transform((value) => value === 'on')

const ParentPortalSchema = z.object({
  enabled: Toggle,
  payments: Toggle,
  homework: Toggle,
  exams: Toggle,
  progress: Toggle,
  messages: Toggle,
  booking: Toggle,
  cancellation: Toggle,
})

export async function saveParentPortalSettings(
  _prevState: ParentPortalActionState,
  formData: FormData
): Promise<ParentPortalActionState> {
  const t = await getTranslations()
  const session = await getSession()
  requireMutation(session)
  const { orgId, role } = session

  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const parsed = ParentPortalSchema.safeParse({
    enabled: formData.get('enabled'),
    ...Object.fromEntries(PORTAL_FEATURES.map((f) => [f, formData.get(f)])),
  })
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const db = createServiceRoleClient()
  const { error: updateError } = await db
    .from('organizations')
    .update({ portal_settings: parsed.data satisfies PortalSettings })
    .eq('id', orgId)

  if (updateError) {
    console.error('[settings/parent-portal] DB update failed', {
      orgId,
      error: updateError.message,
    })
    return { error: t('settings.parentPortal.errors.saveFailed') }
  }

  revalidatePath('/settings/parent-portal')
  revalidatePath('/settings')
  return { error: null, success: true }
}
