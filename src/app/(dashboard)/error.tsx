'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AlertTriangle, ArrowUpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

function parseQuotaKind(message: string): 'students' | 'lessons_monthly' | null {
  if (!message.startsWith('QUOTA_EXCEEDED:')) return null
  const kind = message.slice('QUOTA_EXCEEDED:'.length)
  if (kind === 'students' || kind === 'lessons_monthly') return kind
  return null
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
  }, [error])

  if (quotaKind) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
          <ArrowUpCircle className="mx-auto h-12 w-12 text-orange-500 mb-4" />
          <h1 className="text-xl font-bold text-foreground mb-2">
            {t('quotaExceeded.title', { fallback: 'הגעת למכסה של החבילה' })}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {quotaKind === 'students'
              ? t('quotaExceeded.students', {
                  fallback: 'הגעת למספר התלמידים המרבי בחבילה הנוכחית. שדרג כדי להוסיף עוד תלמידים.',
                })
              : t('quotaExceeded.lessons', {
                  fallback:
                    'הגעת למספר השיעורים החודשי המרבי בחבילה הנוכחית. שדרג כדי לתזמן עוד שיעורים.',
                })}
          </p>
          <div className="flex flex-col gap-3">
            <Button asChild>
              <Link href="/account/billing?upgrade=quota">
                {t('quotaExceeded.upgrade', { fallback: 'שדרג חבילה' })}
              </Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              {t('quotaExceeded.retry', { fallback: 'נסה שוב' })}
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
        {t('generic.title', { fallback: 'משהו השתבש' })}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t('generic.description', { fallback: 'אירעה שגיאה בלתי צפויה. ניתן לנסות שוב.' })}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>
          {t('generic.retry', { fallback: 'נסה שוב' })}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            {t('generic.backToDashboard', { fallback: 'חזרה לדשבורד' })}
          </Link>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-muted-foreground">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
