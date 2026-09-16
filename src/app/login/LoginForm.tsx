'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { DiaryField } from '@/components/diary/DiaryField'
import { signIn } from './actions'

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null)
  const t = useTranslations('auth.login')
  const passwordRef = useRef<HTMLInputElement>(null)

  // React resets the form after a server action, so a rejected sign-in used to
  // drop the user back to two empty fields with focus on <body> — nothing to
  // announce the failure, and nowhere to start typing. Send them to the field
  // that is almost always the wrong one.
  useEffect(() => {
    if (state?.error) passwordRef.current?.focus()
  }, [state])

  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  return (
    <form action={action} className="grid gap-6">
      <DiaryField
        id="email"
        name="email"
        label={t('email')}
        type="email"
        required
        defaultValue={state?.email ?? ''}
        autoComplete="email"
        placeholder="you@example.com"
        dir="ltr"
      />

      <DiaryField
        id="password"
        name="password"
        label={t('password')}
        labelEnd={
          <Link href="/forgot-password" className="link-rule shrink-0 text-sm">
            {t('forgotPassword')}
          </Link>
        }
        type="password"
        ref={passwordRef}
        required
        autoComplete="current-password"
        placeholder="••••••••"
        dir="ltr"
        error={state?.error ?? null}
      />

      <div>
        <button type="submit" disabled={pending} className="hl-cta" data-cta="login-submit">
          {pending ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  )
}
