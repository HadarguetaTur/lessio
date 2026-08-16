'use client'

/**
 * Session-free language toggle for public shells (booking WebView, parent portal).
 * Receives the cookie-setting server action as a prop per the project rule that
 * shared UI components never import server actions directly.
 */

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'

interface LocaleToggleProps {
  currentLocale: string
  action: (formData: FormData) => Promise<void>
}

export function LocaleToggle({ currentLocale, action }: LocaleToggleProps) {
  const [isPending, startTransition] = useTransition()
  const next = currentLocale === 'he' ? 'en' : 'he'
  const label = currentLocale === 'he' ? 'EN' : 'עב'

  function handleSubmit(formData: FormData) {
    startTransition(() => action(formData))
  }

  return (
    <form action={handleSubmit}>
      <input type="hidden" name="locale" value={next} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={isPending}
        aria-label={currentLocale === 'he' ? 'Switch to English' : 'החלפה לעברית'}
        className="h-9 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
      >
        {label}
      </Button>
    </form>
  )
}
