'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'

interface ReportMonthNavProps {
  /** "YYYY-MM" currently shown. */
  month: string
  /** "YYYY-MM" of today in the org timezone. */
  currentMonth: string
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year, m - 1 + delta, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Previous / next month arrows for a monthly report. Writes only `?month=`
 * and keeps every other query param, so a page can add filters of its own.
 */
export function ReportMonthNav({ month, currentMonth }: ReportMonthNavProps) {
  const t = useTranslations('reports.monthNav')
  const uiLocale = parseAppLocale(useLocale())
  const isRtl = uiLocale === 'he'
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const hrefFor = (target: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', target)
    return `${pathname}?${params.toString()}`
  }

  const [year, m] = month.split('-').map(Number)
  const label = new Intl.DateTimeFormat(toIntlLocale(uiLocale), { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, m - 1, 15)))

  return (
    <div className="flex items-center gap-1" dir={isRtl ? 'rtl' : 'ltr'}>
      {month !== currentMonth && (
        <Link
          href={hrefFor(currentMonth)}
          className="me-1 rounded-md border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
        >
          {t('thisMonth')}
        </Link>
      )}
      <button
        type="button"
        onClick={() => router.push(hrefFor(shiftMonth(month, -1)))}
        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
        title={t('previous')}
        aria-label={t('previous')}
      >
        {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <span className="min-w-32 text-center text-sm font-medium text-foreground">{label}</span>
      <button
        type="button"
        onClick={() => router.push(hrefFor(shiftMonth(month, 1)))}
        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
        title={t('next')}
        aria-label={t('next')}
      >
        {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
    </div>
  )
}
