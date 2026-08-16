'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'

/**
 * Portal-scoped error boundary.
 *
 * Without this, every throw in the portal tree fell through to the root
 * src/app/error.tsx — hardcoded Hebrew, LTR, and offering only a link to the
 * marketing site, which is a dead end for a parent on a phone.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('portal.error')
  const params = useParams<{ orgId: string }>()

  useEffect(() => {
    console.error('[portal] Unhandled error', error)
  }, [error])

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 py-16 text-center gap-4">
      <AlertCircle size={28} className="text-muted-foreground/50" aria-hidden />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('body')}</p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          {t('retry')}
        </button>
        {params?.orgId && (
          <Link
            href={`/portal/${params.orgId}/login`}
            className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
          >
            {t('backToLogin')}
          </Link>
        )}
      </div>

      {error.digest && (
        <p className="pt-2 text-xs text-muted-foreground/70" dir="ltr">
          Error ID: {error.digest}
        </p>
      )}
    </div>
  )
}
