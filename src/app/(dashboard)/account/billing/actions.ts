'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function requestCancelSaasAtPeriodEndAction(): Promise<{ error: string } | void> {
  const session = await getSession()
  try {
    requireMutation(session)
  } catch {
    return { error: 'Read-only session' }
  }
  if (session.role !== 'owner') return { error: 'Forbidden' }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('organization_subscriptions')
    .update({ cancel_at_period_end: true })
    .eq('organization_id', session.orgId)

  if (error) return { error: error.message }
  revalidatePath('/account/billing')
}
