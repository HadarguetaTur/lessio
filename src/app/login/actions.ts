'use server'

import { getTranslations } from 'next-intl/server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function signIn(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const t = await getTranslations('auth.errors')
    return { error: t('invalidCredentials') }
  }

  // Sync locale cookie from the user's saved preference so the UI
  // appears in the correct language immediately on first page load.
  if (data.user) {
    const db = createServiceRoleClient()
    const { data: profile } = await db
      .from('profiles')
      .select('preferred_locale')
      .eq('id', data.user.id)
      .single()

    if (profile?.preferred_locale) {
      const cookieStore = await cookies()
      cookieStore.set('locale', profile.preferred_locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: false,
        sameSite: 'lax',
      })
    }
  }

  redirect('/dashboard')
}
