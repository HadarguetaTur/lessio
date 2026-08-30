'use client'

import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import type { ConfirmBookingResult } from '@/lib/booking'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'

interface BookingSuccessProps {
  result: ConfirmBookingResult
  teacherName: string
  timezone: string
  /** Named on the confirmation so the parent can see which child it was for. */
  studentName?: string
  /** Where to go next. Omitted on the public /book/[token] flow, which has no schedule to return to. */
  scheduleHref?: string
}

export function BookingSuccess({
  result,
  teacherName,
  timezone,
  studentName,
  scheduleHref,
}: BookingSuccessProps) {
  const t = useTranslations('booking.success')
  const intlLocale = toIntlLocale(parseAppLocale(useLocale()))

  const startTime = new Date(result.startAt).toLocaleTimeString(intlLocale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })

  const displayDate = new Date(result.startAt).toLocaleDateString(intlLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  })

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="text-5xl" aria-hidden="true">✅</div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        {studentName && <p className="text-base font-medium">{studentName}</p>}
        <p className="text-muted-foreground text-sm">
          {teacherName} · {displayDate} · {startTime}
        </p>
        <p className="text-sm">{t('whatsappNote')}</p>
        {scheduleHref && (
          <Link
            href={scheduleHref}
            className="inline-flex items-center justify-center w-full min-h-11 px-4 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
          >
            {t('viewSchedule')}
          </Link>
        )}
      </div>
    </main>
  )
}
