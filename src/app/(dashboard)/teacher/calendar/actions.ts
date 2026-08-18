'use server'

/**
 * Server actions for teacher iCal calendar subscription.
 * Per /docs/sprint-16-scope.md § Story 4.
 */

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

/**
 * Regenerates the teacher's ical_token.
 * Invalidates all existing calendar subscriptions immediately.
 * Returns an error string on failure (so the old token stays valid).
 */
export async function regenerateCalendarTokenAction(): Promise<{ error?: string }> {
  const t = await getTranslations()
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)

  if (role !== 'teacher') {
    return { error: await commonError('noPermission') }
  }

  const db = createServiceRoleClient()

  const { error } = await db
    .from('teachers')
    .update({ ical_token: crypto.randomUUID() })
    .eq('profile_id', userId)
    .eq('organization_id', orgId)

  if (error) {
    console.error('[teacher/calendar] Failed to regenerate ical_token', { userId, orgId, error: error.message })
    return { error: t('teacherSelf.errors.refreshLinkFailed') }
  }

  console.info('[teacher/calendar] iCal token regenerated', { userId, orgId })
  revalidatePath('/teacher/calendar')
  return {}
}
