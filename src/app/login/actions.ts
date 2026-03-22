'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signIn(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'אימייל או סיסמה שגויים' }
  }

  redirect('/dashboard')
}
