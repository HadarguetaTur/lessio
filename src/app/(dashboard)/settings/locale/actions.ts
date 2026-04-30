'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'

const schema = z.object({ locale: z.enum(['he', 'en']) })

export async function saveLocaleAction(formData: FormData) {
  const session = await getSession()
  requireMutation(session)

  const parsed = schema.safeParse({ locale: formData.get('locale') })
  if (!parsed.success) return

  const { locale } = parsed.data

  const db = createServiceRoleClient()
  await db.from('profiles').update({ preferred_locale: locale }).eq('id', session.profileId)

  const cookieStore = await cookies()
  cookieStore.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax',
  })

  revalidatePath('/', 'layout')
}
