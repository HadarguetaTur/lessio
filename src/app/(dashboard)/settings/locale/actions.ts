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
