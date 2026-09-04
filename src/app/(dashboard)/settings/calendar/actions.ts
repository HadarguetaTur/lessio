'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DEFAULT_SELECTED_CALENDARS } from '@/lib/google-calendar'
import { resolveSelectionUpdate } from '@/lib/google-calendar/selection'
import { forbidden } from 'next/navigation'

export async function disconnectOrgCalendar() {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner') forbidden()

  const db = createServiceRoleClient()
  await db
    .from('organizations')
    .update({
      google_calendar_refresh_token:      null,
      google_calendar_email:              null,
      google_calendar_selected_calendars: DEFAULT_SELECTED_CALENDARS,
    })
    .eq('id', session.orgId)

  revalidatePath('/settings/calendar')
}

const SelectionSchema = z.array(z.string().min(1).max(512)).min(1).max(50)

export async function updateOrgCalendarSelection(
  ids: string[]
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner') forbidden()

  const t = await getTranslations('settings.calendarSelection')

  const parsed = SelectionSchema.safeParse(ids)
  if (!parsed.success) return { ok: false, error: t('saveError') }

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('google_calendar_refresh_token, google_calendar_selected_calendars')
    .eq('id', session.orgId)
    .maybeSingle()

  if (!org?.google_calendar_refresh_token) return { ok: false, error: t('saveError') }

  const result = await resolveSelectionUpdate({
    encryptedToken: org.google_calendar_refresh_token,
    currentRaw:     org.google_calendar_selected_calendars,
    requestedIds:   parsed.data,
  })
  if (!result.ok) {
    return { ok: false, error: t(result.reason === 'list_failed' ? 'listError' : 'saveError') }
  }

  const { error: dbErr } = await db
    .from('organizations')
    .update({ google_calendar_selected_calendars: result.selection })
    .eq('id', session.orgId)

  if (dbErr) {
    console.error('[settings/calendar] selection update failed', { error: dbErr })
    return { ok: false, error: t('saveError') }
  }

  revalidatePath('/settings/calendar')
  return { ok: true }
}
