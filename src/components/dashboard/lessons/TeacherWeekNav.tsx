'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatWeekRangeLabel, parseAppLocale } from '@/lib/i18n/locale'

interface TeacherWeekNavProps {
  weekStr: string
}

export function TeacherWeekNav({ weekStr }: TeacherWeekNavProps) {
  const router = useRouter()
  const t = useTranslations('lessons')
  const uiLocale = parseAppLocale(useLocale())

  function navigate(delta: number) {
    const base = new Date(`${weekStr}T12:00:00Z`)
    const next = new Date(base.getTime() + delta * 7 * 24 * 60 * 60 * 1000)
    const nextStr = next.toISOString().substring(0, 10)
    router.push(`/teacher/schedule?week=${nextStr}`)
  }

  const label = formatWeekRangeLabel(weekStr, uiLocale)

  return (
    <div className="flex items-center gap-1" dir="ltr">
      <button
        onClick={() => navigate(-1)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title={t('series.prevWeek')}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-medium text-gray-800 min-w-44 text-center">{label}</span>
      <button
        onClick={() => navigate(1)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
        title={t('series.nextWeek')}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
