'use server'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSession, requireMutation } from '@/lib/auth/session'

export async function markSetupWelcomeSeen(): Promise<void> {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner') return

  await createServiceRoleClient()
    .from('organizations')
    .update({ setup_welcome_seen_at: new Date().toISOString() })
    .eq('id', session.orgId)
    .is('setup_welcome_seen_at', null)
}
