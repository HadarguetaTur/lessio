'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'

interface DayNavProps {
  dateStr: string       // YYYY-MM-DD
  todayStr: string      // YYYY-MM-DD
  teacherId?: string
}

export function DayNav({ dateStr, todayStr, teacherId }: DayNavProps) {
  const t = useTranslations('lessons')
  const uiLocale = parseAppLocale(useLocale())
  const intlLocale = toIntlLocale(uiLocale)
  const router = useRouter()
  const searchParams = useSearchParams()

  function navigate(delta: number) {
    const base = new Date(`${dateStr}T12:00:00Z`)
    const next = new Date(base.getTime() + delta * 24 * 60 * 60 * 1000)
    const nextStr = next.toISOString().substring(0, 10)
    const params = new URLSearchParams({ view: 'day', date: nextStr })
    if (teacherId) params.set('teacher', teacherId)
    const student = searchParams.get('student')
    if (student) params.set('student', student)
    router.push(`/lessons?${params.toString()}`)
  }

  const isToday = dateStr === todayStr

  const label = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateStr}T12:00:00Z`))

  return (
    <div className="flex items-center gap-1" dir="ltr">
      {!isToday && (
        <Link
          href={(() => {
            const p = new URLSearchParams({ view: 'day', date: todayStr })
            if (teacherId) p.set('teacher', teacherId)
            const student = searchParams.get('student')
            if (student) p.set('student', student)
            return `/lessons?${p.toString()}`
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
        <ChevronLeft size={18} />
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
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
