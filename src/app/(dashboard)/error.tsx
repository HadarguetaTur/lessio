'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AlertTriangle, ArrowUpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reportClientError } from '@/lib/telemetry/reportClientError'

type QuotaKind = 'students' | 'lessons_monthly' | 'teachers'

/**
 * The message key does not match the kind (`lessons_monthly` → `lessons`), so
 * this is a map rather than a template. Exhaustive over QuotaKind, so adding a
 * dimension without copy is a compile error instead of a missing-message crash.
 */
const QUOTA_MESSAGE_KEY: Record<QuotaKind, string> = {
  students: 'quotaExceeded.students',
  lessons_monthly: 'quotaExceeded.lessons',
  teachers: 'quotaExceeded.teachers',
}

function parseQuotaKind(message: string): QuotaKind | null {
  if (!message.startsWith('QUOTA_EXCEEDED:')) return null
  const kind = message.slice('QUOTA_EXCEEDED:'.length)
  return kind in QUOTA_MESSAGE_KEY ? (kind as QuotaKind) : null
}

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')
  const quotaKind = parseQuotaKind(error.message)

  useEffect(() => {
    console.error('[dashboard/error-boundary] Unhandled error', error)
    // A quota block is a product state the user can act on, not a defect —
    // reporting it would bury the real bugs in the feed.
    if (!quotaKind) reportClientError(error)
  }, [error, quotaKind])

  if (quotaKind) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
          <ArrowUpCircle className="mx-auto h-12 w-12 text-orange-500 mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">
            {t('quotaExceeded.title')}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t(QUOTA_MESSAGE_KEY[quotaKind])}
          </p>
          <div className="flex flex-col gap-3">
            <Button asChild>
              {/* The kind travels in the param: billing renders the matching
                  explanation. `?upgrade=quota` was not a recognised value, so
                  the banner never showed and the user arrived with no reason. */}
              <Link href={`/account/billing?upgrade=quota_${quotaKind}`}>
                {t('quotaExceeded.upgrade')}
              </Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              {t('quotaExceeded.retry')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-4" />
      <h1 className="text-xl font-bold text-foreground mb-2">
        {t('generic.title')}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t('generic.description')}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>
          {t('generic.retry')}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            {t('generic.backToDashboard')}
          </Link>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-muted-foreground">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
