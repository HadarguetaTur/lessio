'use client'

import { useTransition } from 'react'
import { setLandingLocaleAction } from '@/app/landing-locale-action'
import { cn } from '@/lib/utils'

export function LandingLocaleToggle({ currentLocale, className }: { currentLocale: string; className?: string }) {
  const [isPending, startTransition] = useTransition()
  const next = currentLocale === 'he' ? 'en' : 'he'
  const label = currentLocale === 'he' ? 'EN' : 'עב'

  function handleSubmit(formData: FormData) {
    startTransition(() => setLandingLocaleAction(formData))
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        disabled={isPending}
        aria-label={next === 'en' ? 'Switch to English' : 'החלפה לעברית'}
        className={cn(
          'inline-flex min-h-9 items-center px-2.5 text-xs font-semibold underline-offset-4 hover:underline disabled:opacity-60 sm:text-sm',
          className
        )}
      >
        {label}
      </button>
    </form>
  )
}
