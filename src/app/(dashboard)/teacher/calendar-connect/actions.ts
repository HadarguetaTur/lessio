'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function disconnectTeacherCalendar() {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'teacher') return

  const db = createServiceRoleClient()
  await db
    .from('teachers')
    .update({
      google_calendar_refresh_token: null,
      google_calendar_email:         null,
    })
    .eq('profile_id', session.profileId)

  revalidatePath('/teacher/calendar-connect')
}
