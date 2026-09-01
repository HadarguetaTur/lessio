'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { preserveCalendarParams } from './calendarParams'

interface DayNavProps {
  dateStr: string       // YYYY-MM-DD
  todayStr: string      // YYYY-MM-DD
  scheduleBasePath?: string
  teacherId?: string
}

export function DayNav({ dateStr, todayStr, scheduleBasePath = '/lessons', teacherId }: DayNavProps) {
  const t = useTranslations('lessons')
  const uiLocale = parseAppLocale(useLocale())
  const isRtl = uiLocale === 'he'
  const intlLocale = toIntlLocale(uiLocale)
  const router = useRouter()
  const searchParams = useSearchParams()

  function navigate(delta: number) {
    const base = new Date(`${dateStr}T12:00:00Z`)
    const next = new Date(base.getTime() + delta * 24 * 60 * 60 * 1000)
    const nextStr = next.toISOString().substring(0, 10)
    const params = new URLSearchParams({ view: 'day', date: nextStr })
    if (scheduleBasePath === '/lessons' && teacherId) params.set('teacher', teacherId)
    preserveCalendarParams(searchParams, params)
    router.push(`${scheduleBasePath}?${params.toString()}`)
  }

  const isToday = dateStr === todayStr

  const label = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateStr}T12:00:00Z`))

  return (
    <div className="flex w-full max-w-md items-center justify-center gap-1 sm:w-auto sm:max-w-none sm:justify-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {!isToday && (
        <Link
          href={(() => {
            const p = new URLSearchParams({ view: 'day', date: todayStr })
            if (scheduleBasePath === '/lessons' && teacherId) p.set('teacher', teacherId)
            preserveCalendarParams(searchParams, p)
            return `${scheduleBasePath}?${p.toString()}`
          })()}
          className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors ml-1"
        >
          {t('today')}
        </Link>
      )}
      <button
        onClick={() => navigate(-1)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title={t('prevDay')}
      >
        {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <span
        className="text-sm font-medium text-gray-800 min-w-28 sm:min-w-60 text-center"
        dir={uiLocale === 'he' ? 'rtl' : 'ltr'}
      >
        {label}
      </span>
      <button
        onClick={() => navigate(1)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title={t('nextDay')}
      >
        {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
    </div>
  )
}
