'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'

export async function updatePassword(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const password = formData.get('password') as string
  const confirm = formData.get('confirm') as string
  const t = await getTranslations('auth.resetPassword')

  if (password.length < 8) return { error: t('tooShort') }
  if (password !== confirm) return { error: t('mismatch') }

  // Reject calls that didn't arrive via the email recovery flow.
  // The pw_reset cookie is set exclusively by /auth/callback after a valid
  // verifyOtp('recovery') or PKCE code exchange for password reset, and is
  // cleared here upon success.
  const cookieStore = await cookies()
  if (cookieStore.get('pw_reset')?.value !== '1') {
    const tErr = await getTranslations('auth.errors')
    return { error: tErr('generic') }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    const tErr = await getTranslations('auth.errors')
    return { error: tErr('generic') }
  }

  cookieStore.delete('pw_reset')
  redirect('/dashboard')
}
