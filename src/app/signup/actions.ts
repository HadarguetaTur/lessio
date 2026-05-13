'use server'

import { getLocale, getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'

import {
  buildSignupSchema,
  createOrgWithOwner,
} from '@/lib/auth/createOrgWithOwner'
import { createClient } from '@/lib/supabase/server'
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

  // Build the callback URL so the confirmation email lands the user on onboarding.
  const headersList = await headers()
  const host = headersList.get('host') ?? 'www.getlessio.com'
  const proto = headersList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const appUrl = `${proto}://${host}`

  // Trigger Supabase's confirmation email. Errors here are non-fatal — the user
  // can request a resend from the verify page.
  const supabase = await createClient()
  await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: { emailRedirectTo: `${appUrl}/auth/callback?next=/onboarding` },
  })

  // Persist locale so the verify page and onboarding render in the correct language.
  const locale = await getLocale()
  const cookieStore = await cookies()
  cookieStore.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
    sameSite: 'lax',
  })

  redirect(`/signup/verify?email=${encodeURIComponent(parsed.data.email)}`)
}
