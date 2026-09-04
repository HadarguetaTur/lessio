'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DEFAULT_SELECTED_CALENDARS } from '@/lib/google-calendar'
import { resolveSelectionUpdate } from '@/lib/google-calendar/selection'

export async function disconnectTeacherCalendar() {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'teacher') return

  const db = createServiceRoleClient()
  await db
    .from('teachers')
    .update({
      google_calendar_refresh_token:      null,
      google_calendar_email:              null,
      google_calendar_selected_calendars: DEFAULT_SELECTED_CALENDARS,
    })
    .eq('profile_id', session.profileId)

  revalidatePath('/teacher/calendar-connect')
}

const SelectionSchema = z.array(z.string().min(1).max(512)).min(1).max(50)

export async function updateTeacherCalendarSelection(
  ids: string[]
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession()
  requireMutation(session)

  const t = await getTranslations('settings.calendarSelection')

  if (session.role !== 'teacher') return { ok: false, error: t('saveError') }

  const parsed = SelectionSchema.safeParse(ids)
  if (!parsed.success) return { ok: false, error: t('saveError') }

  const db = createServiceRoleClient()
  const { data: teacher } = await db
    .from('teachers')
    .select('google_calendar_refresh_token, google_calendar_selected_calendars')
    .eq('profile_id', session.profileId)
    .maybeSingle()

  if (!teacher?.google_calendar_refresh_token) return { ok: false, error: t('saveError') }

  const result = await resolveSelectionUpdate({
    encryptedToken: teacher.google_calendar_refresh_token,
    currentRaw:     teacher.google_calendar_selected_calendars,
    requestedIds:   parsed.data,
  })
  if (!result.ok) {
    return { ok: false, error: t(result.reason === 'list_failed' ? 'listError' : 'saveError') }
  }

  const { error: dbErr } = await db
    .from('teachers')
    .update({ google_calendar_selected_calendars: result.selection })
    .eq('profile_id', session.profileId)

  if (dbErr) {
    console.error('[teacher/calendar-connect] selection update failed', { error: dbErr })
    return { ok: false, error: t('saveError') }
  }

  revalidatePath('/teacher/calendar-connect')
  return { ok: true }
}
