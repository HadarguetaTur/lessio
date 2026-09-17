'use client'

import { useTransition } from 'react'
import { setLandingLocaleAction } from '@/app/landing-locale-action'
import { cn } from '@/lib/utils'

/**
 * Language switch on the diary's cover strip.
 *
 * Deliberately a plain button, not a form submit: on the auth pages it sits
 * before the sign-in form in the DOM, and anything that looks for "the submit
 * button" (capture scripts, password managers, a test) must find the form's
 * own action, not this one.
 */
export function DiaryLocaleToggle({ currentLocale, className }: { currentLocale: string; className?: string }) {
  const [isPending, startTransition] = useTransition()
  const next = currentLocale === 'he' ? 'en' : 'he'
  const label = currentLocale === 'he' ? 'EN' : 'עב'

  function switchLocale() {
    const formData = new FormData()
    formData.set('locale', next)
    startTransition(() => setLandingLocaleAction(formData))
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      disabled={isPending}
      aria-label={next === 'en' ? 'Switch to English' : 'החלפה לעברית'}
      className={cn(
        'inline-flex min-h-9 items-center px-2.5 text-xs font-semibold underline-offset-4 hover:underline disabled:opacity-60 sm:text-sm',
        className
      )}
    >
      {label}
    </button>
  )
}
