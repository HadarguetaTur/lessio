'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'

interface MonthNavProps {
  monthStr: string       // "YYYY-MM"
  currentMonthStr: string // "YYYY-MM" for today
  teacherId?: string
}

export function MonthNav({ monthStr, currentMonthStr, teacherId }: MonthNavProps) {
  const t = useTranslations('lessons')
  const uiLocale = parseAppLocale(useLocale())
  const intlLocale = toIntlLocale(uiLocale)
  const router = useRouter()
  const searchParams = useSearchParams()

  function navigate(delta: number) {
    const [year, month] = monthStr.split('-').map(Number)
    const next = new Date(Date.UTC(year, month - 1 + delta, 1))
    const nextStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
    const params = new URLSearchParams({ view: 'month', month: nextStr })
    if (teacherId) params.set('teacher', teacherId)
    const student = searchParams.get('student')
    if (student) params.set('student', student)
    router.push(`/lessons?${params.toString()}`)
  }

  const isCurrentMonth = monthStr === currentMonthStr

  const [year, month] = monthStr.split('-').map(Number)
  const label = new Intl.DateTimeFormat(intlLocale, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 15)))

  return (
    <div className="flex items-center gap-1" dir="ltr">
      {!isCurrentMonth && (
        <Link
          href={(() => {
            const p = new URLSearchParams({ view: 'month', month: currentMonthStr })
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
        title={t('prevMonth')}
      >
        <ChevronLeft size={18} />
      </button>
      <span
        className="text-sm font-medium text-gray-800 min-w-28 sm:min-w-44 text-center"
        dir={uiLocale === 'he' ? 'rtl' : 'ltr'}
      >
        {label}
      </span>
      <button
        onClick={() => navigate(1)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title={t('nextMonth')}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
