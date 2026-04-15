'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const schema = z.object({ locale: z.enum(['he', 'en']) })

export async function setLandingLocaleAction(formData: FormData) {
  const parsed = schema.safeParse({ locale: formData.get('locale') })
  if (!parsed.success) return

  const cookieStore = await cookies()
  cookieStore.set('locale', parsed.data.locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax',
  })

  revalidatePath('/', 'layout')
}
