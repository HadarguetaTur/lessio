'use server'

import { getRequestBaseUrl } from '@/lib/url/requestUrl'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'

export async function sendPasswordResetEmail(
  _prevState: { error?: string; sent?: boolean; email?: string } | null,
  formData: FormData
): Promise<{ error?: string; sent?: boolean; email?: string }> {
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  if (!email) return { error: 'required' }

  const appUrl = await getRequestBaseUrl()
  const redirectTo = `${appUrl}/auth/callback?next=/reset-password`

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) {
    const t = await getTranslations('auth.errors')
    return { error: t('generic') }
  }

  return { sent: true, email }
}
