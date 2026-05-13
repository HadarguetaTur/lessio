'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'

export async function resendVerificationEmail(
  _prevState: { error?: string; sent?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; sent?: boolean }> {
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  if (!email) return { error: 'invalid' }

  const headersList = await headers()
  const host = headersList.get('host') ?? 'www.getlessio.com'
  const proto = headersList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const appUrl = `${proto}://${host}`

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${appUrl}/auth/callback?next=/onboarding` },
  })

  if (error) {
    const t = await getTranslations('auth.errors')
    return { error: t('generic') }
  }

  return { sent: true }
}
