'use client'

import { useTransition } from 'react'
import { setLandingLocaleAction } from '@/app/landing-locale-action'
import { Button } from '@/components/ui/button'

export function LandingLocaleToggle({ currentLocale }: { currentLocale: string }) {
  const [isPending, startTransition] = useTransition()
  const next = currentLocale === 'he' ? 'en' : 'he'
  const label = currentLocale === 'he' ? 'EN' : 'עב'

  function handleSubmit(formData: FormData) {
    startTransition(() => setLandingLocaleAction(formData))
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="locale" value={next} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={isPending}
        className="h-9 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
      >
        {label}
      </Button>
    </form>
  )
}
