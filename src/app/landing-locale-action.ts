'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { setLocaleCookie } from '@/lib/i18n/localeCookie'
import { z } from 'zod'

const schema = z.object({ locale: z.enum(['he', 'en']) })

export async function setLandingLocaleAction(formData: FormData) {
  const parsed = schema.safeParse({ locale: formData.get('locale') })
  if (!parsed.success) return

  setLocaleCookie(await cookies(), parsed.data.locale)

  revalidatePath('/', 'layout')
}
