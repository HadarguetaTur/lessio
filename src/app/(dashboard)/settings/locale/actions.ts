'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { setLocaleCookie } from '@/lib/i18n/localeCookie'
import { z } from 'zod'

const schema = z.object({ locale: z.enum(['he', 'en']) })

export async function saveLocaleAction(formData: FormData) {
  const session = await getSession()
  requireMutation(session, { allowWhenLapsed: true })

  const parsed = schema.safeParse({ locale: formData.get('locale') })
  if (!parsed.success) return

  const { locale } = parsed.data

  const db = createServiceRoleClient()
  await db.from('profiles').update({ preferred_locale: locale }).eq('id', session.profileId)

  setLocaleCookie(await cookies(), locale)

  revalidatePath('/', 'layout')
}

/**
 * The org's fallback language for parent-facing WhatsApp messages — what a
 * parent gets when they have no stored preference and their message carried no
 * language signal. Read by every send path via resolveRecipientLocale; until
 * now (UX audit 5, F20) no screen could write it, so an English-speaking studio
 * silently messaged its parents in Hebrew.
 *
 * Owner only: this changes what every parent in the org receives.
 */
export async function saveOrgDefaultLocaleAction(formData: FormData) {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'owner') return

  const parsed = schema.safeParse({ locale: formData.get('locale') })
  if (!parsed.success) return

  const db = createServiceRoleClient()
  await db
    .from('organizations')
    .update({ default_locale: parsed.data.locale })
    .eq('id', session.orgId)

  revalidatePath('/settings/locale')
}
