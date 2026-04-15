'use server'

import { getLocale, getTranslations } from 'next-intl/server'

import {
  buildSignupSchema,
  createOrgWithOwner,
} from '@/lib/auth/createOrgWithOwner'
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

  const tAuth = await getTranslations('auth.errors')
  const confirmPassword = formData.get('confirm_password') as string ?? ''
  if (raw.password !== confirmPassword) {
    return { error: tAuth('passwordsMismatch') }
  }

  const tVal = await getTranslations('auth.validation')
  const schema = buildSignupSchema((key) => tVal(key))
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? tAuth('invalidData') }
  }

  const tSrv = await getTranslations('auth.signupServerErrors')
  const flowErrors = {
    emailTaken: tSrv('emailTaken'),
    accountFailed: tSrv('accountFailed'),
    orgFailed: tSrv('orgFailed'),
    profileFailed: tSrv('profileFailed'),
  }

  const result = await createOrgWithOwner(parsed.data, flowErrors)

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

  const locale = await getLocale()
  const cookieStore = await cookies()
  cookieStore.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax',
  })

  redirect('/login?registered=true')
}
