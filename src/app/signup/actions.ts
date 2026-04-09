'use server'

import { createOrgWithOwner, SignupSchema } from '@/lib/auth/createOrgWithOwner'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function signUp(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const raw = {
    org_name: (formData.get('org_name') as string ?? '').trim(),
    full_name: (formData.get('full_name') as string ?? '').trim(),
    email: (formData.get('email') as string ?? '').trim(),
    password: formData.get('password') as string ?? '',
  }

  const confirmPassword = formData.get('confirm_password') as string ?? ''
  if (raw.password !== confirmPassword) {
    return { error: 'הסיסמאות אינן תואמות' }
  }

  const parsed = SignupSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }

  const result = await createOrgWithOwner(parsed.data)

  if (!result.success) {
    return { error: result.error }
  }

  // Sign in the user immediately after signup
  const db = createServiceRoleClient()
  const { data: session } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: parsed.data.email,
  })

  if (!session) {
    // Fallback: redirect to login page so user can sign in manually
    redirect('/login')
  }

  // Set locale cookie
  const cookieStore = await cookies()
  cookieStore.set('locale', 'he', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax',
  })

  redirect('/login?registered=true')
}
