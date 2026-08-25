'use server'

import { getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { setLocaleCookie } from '@/lib/i18n/localeCookie'
import type { AppLocale } from '@/lib/i18n/serverTranslator'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

function detectLocale(acceptLanguage: string | null): 'he' | 'en' {
  if (!acceptLanguage) return 'he'
  const first = acceptLanguage.split(',')[0]?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (first.startsWith('he')) return 'he'
  if (first.startsWith('en')) return 'en'
  return 'en'
}

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

  // Sync locale: use saved preference if present, otherwise detect from Accept-Language
  // and persist it so future visits use the correct language without re-detection.
  if (data.user) {
    const db = createServiceRoleClient()
    const { data: profile } = await db
      .from('profiles')
      .select('preferred_locale')
      .eq('id', data.user.id)
      .single()

    const cookieStore = await cookies()

    if (profile?.preferred_locale) {
      setLocaleCookie(cookieStore, profile.preferred_locale as AppLocale)
    } else {
      // First login — detect from Accept-Language and persist to DB
      const headerStore = await headers()
      const detectedLocale = detectLocale(headerStore.get('accept-language'))
      setLocaleCookie(cookieStore, detectedLocale)
      await db
        .from('profiles')
        .update({ preferred_locale: detectedLocale })
        .eq('id', data.user.id)
    }
  }

  redirect('/dashboard')
}
