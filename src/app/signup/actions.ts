'use server'

import { getLocale, getTranslations } from 'next-intl/server'
import { getRequestBaseUrl } from '@/lib/url/requestUrl'

import {
  buildSignupSchema,
  createOrgWithOwner,
} from '@/lib/auth/createOrgWithOwner'
import { createClient } from '@/lib/supabase/server'
import { setLocaleCookie } from '@/lib/i18n/localeCookie'
import {
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
  VISITOR_COOKIE,
  buildOrgAttribution,
  decodeTouch,
} from '@/lib/attribution'
import type { AppLocale } from '@/lib/i18n/serverTranslator'
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

  // Freeze where this signup came from onto the org. Read before the org is
  // created, because after it the cookies are no longer the only record.
  const jar = await cookies()
  const visitorId = jar.get(VISITOR_COOKIE)?.value ?? null
  const result = await createOrgWithOwner(parsed.data, flowErrors, {
    attribution: buildOrgAttribution({
      firstTouch: decodeTouch(jar.get(FIRST_TOUCH_COOKIE)?.value),
      lastTouch: decodeTouch(jar.get(LAST_TOUCH_COOKIE)?.value),
      visitorId,
    }),
    visitorId,
  })

  if (!result.success) {
    return { error: result.error }
  }

  // Build the callback URL so the confirmation email lands the user on onboarding.
  const appUrl = await getRequestBaseUrl()

  // Trigger Supabase's confirmation email. Errors here are non-fatal — the user
  // can request a resend from the verify page.
  const supabase = await createClient()
  await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: { emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard` },
  })

  // Persist locale so the verify page and onboarding render in the correct language.
  const locale = await getLocale()
  setLocaleCookie(await cookies(), locale as AppLocale)

  redirect(`/signup/verify?email=${encodeURIComponent(parsed.data.email)}`)
}
