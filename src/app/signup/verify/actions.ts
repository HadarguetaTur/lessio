'use server'

import { getRequestBaseUrl } from '@/lib/url/requestUrl'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'

export async function resendVerificationEmail(
  _prevState: { error?: string; sent?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; sent?: boolean }> {
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  if (!email) return { error: 'invalid' }

  const appUrl = await getRequestBaseUrl()

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard` },
  })

  if (error) {
    const t = await getTranslations('auth.errors')
    return { error: t('generic') }
  }

  return { sent: true }
}
