'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { reportClientError } from '@/lib/telemetry/reportClientError'

/**
 * Root *segment* error boundary — it renders inside the root layout, so it must not
 * emit <html>/<body> of its own (that shape belongs to global-error.tsx).
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations()
  useEffect(() => {
    console.error('[error-boundary] Unhandled error', error)
    reportClientError(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-bold text-foreground mb-2">{t('errors.generic.title')}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Something went wrong. Please try again.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          {t('errors.generic.retry')}
        </button>
        <Link
          href="/"
          className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
        >
          {t('errors.home')}
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-muted-foreground/70" dir="ltr">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
