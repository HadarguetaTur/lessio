'use client'

import { useActionState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

import Link from 'next/link'

import { signUp } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

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
    <form
      action={action}
      className="grid grid-cols-1 gap-6 text-center lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5 lg:text-start"
    >
      {state?.error && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-center text-sm text-destructive lg:col-span-2 lg:flex-row lg:items-start lg:text-start">
          <AlertCircle size={16} className="shrink-0 lg:mt-0.5" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="org_name" className="block text-foreground lg:text-start">
          {t('orgName')}
        </Label>
        <Input
          id="org_name"
          name="org_name"
          type="text"
          required
          placeholder={t('orgNamePlaceholder')}
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name" className="block text-foreground lg:text-start">
          {t('fullName')}
        </Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          placeholder={t('fullNamePlaceholder')}
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <div className="space-y-2 lg:col-span-2">
        <Label htmlFor="email" className="block text-foreground lg:text-start">
          {t('email')}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          dir="ltr"
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="block text-foreground lg:text-start">
          {t('password')}
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder={t('passwordPlaceholder')}
          dir="ltr"
          minLength={6}
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm_password" className="block text-foreground lg:text-start">
          {t('confirmPassword')}
        </Label>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          required
          autoComplete="new-password"
          placeholder={t('confirmPasswordPlaceholder')}
          dir="ltr"
          minLength={6}
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full border-0 bg-gradient-to-l from-teal-600 via-emerald-600 to-violet-600 px-4 text-base font-semibold text-white shadow-lg shadow-teal-600/20 transition-[filter,box-shadow] hover:brightness-105 hover:shadow-lg hover:shadow-violet-500/25 lg:col-span-2"
      >
        {pending ? t('submitting') : t('submit')}
      </Button>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground lg:col-span-2 lg:text-start">
        {t('consentPrefix')}{' '}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
          {t('consentTerms')}
        </Link>
        {' '}{t('consentAnd')}{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          {t('consentPrivacy')}
        </Link>
        {t('consentSuffix')}
      </p>
    </form>
  )
}
