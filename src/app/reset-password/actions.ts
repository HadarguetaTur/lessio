'use server'

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

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    const tErr = await getTranslations('auth.errors')
    return { error: tErr('generic') }
  }

  redirect('/dashboard')
}
