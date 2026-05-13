'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { forbidden } from 'next/navigation'

export async function disconnectOrgCalendar() {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner') forbidden()

  const db = createServiceRoleClient()
  await db
    .from('organizations')
    .update({
      google_calendar_refresh_token: null,
      google_calendar_email:         null,
    })
    .eq('id', session.orgId)

  revalidatePath('/settings/calendar')
}
