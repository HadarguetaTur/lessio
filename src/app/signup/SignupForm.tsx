'use client'

import { useActionState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

import Link from 'next/link'

import { DiaryField } from '@/components/diary/DiaryField'
import { signUp } from './actions'

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, null)
  const t = useTranslations('auth.signup')

  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  return (
    <form action={action} className="grid gap-6">
      <DiaryField id="org_name" name="org_name" label={t('orgName')} type="text" required placeholder={t('orgNamePlaceholder')} />

      <DiaryField
        id="full_name"
        name="full_name"
        label={t('fullName')}
        type="text"
        required
        autoComplete="name"
        placeholder={t('fullNamePlaceholder')}
      />

      <DiaryField id="email" name="email" label={t('email')} type="email" required autoComplete="email" placeholder="you@example.com" dir="ltr" />

      <div className="grid gap-6 sm:grid-cols-2">
        <DiaryField
          id="password"
          name="password"
          label={t('password')}
          type="password"
          required
          autoComplete="new-password"
          placeholder={t('passwordPlaceholder')}
          dir="ltr"
          minLength={6}
        />
        <DiaryField
          id="confirm_password"
          name="confirm_password"
          label={t('confirmPassword')}
          type="password"
          required
          autoComplete="new-password"
          placeholder={t('confirmPasswordPlaceholder')}
          dir="ltr"
          minLength={6}
        />
      </div>

      {state?.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={pending} className="hl-cta" data-cta="signup-submit">
          {pending ? t('submitting') : t('submit')}
        </button>
      </div>

      <p className="text-sm leading-relaxed text-[color:var(--ink-2)]">
        {t('consentPrefix')}{' '}
        <Link href="/terms" className="link-rule">
          {t('consentTerms')}
        </Link>{' '}
        {t('consentAnd')}{' '}
        <Link href="/privacy" className="link-rule">
          {t('consentPrivacy')}
        </Link>
        {t('consentSuffix')}
      </p>
    </form>
  )
}
