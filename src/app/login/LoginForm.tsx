'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { signIn } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'

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
    <form action={action} className="space-y-6 text-center">
      {state?.error && (
        <div
          role="alert"
          className="flex flex-col items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-center text-sm text-destructive lg:flex-row lg:items-start lg:text-start"
        >
          <AlertCircle size={16} className="shrink-0 lg:mt-0.5" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="block text-foreground">
          {t('email')}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={state?.email ?? ''}
          autoComplete="email"
          placeholder="you@example.com"
          dir="ltr"
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-col items-center gap-2 text-center max-lg:text-center lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:text-start">
          <Label htmlFor="password" className="text-foreground">
            {t('password')}
          </Label>
          <Link
            href="/forgot-password"
            className="shrink-0 text-sm font-medium text-violet-600 underline-offset-4 transition-colors hover:text-violet-500 hover:underline dark:text-violet-400 dark:hover:text-violet-300"
          >
            {t('forgotPassword')}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          ref={passwordRef}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          dir="ltr"
          className="h-11 bg-background/50 px-3.5"
        />
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full px-4 text-base font-semibold"
      >
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  )
}
