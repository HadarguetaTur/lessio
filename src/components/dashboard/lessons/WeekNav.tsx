'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatWeekRangeLabel, parseAppLocale } from '@/lib/i18n/locale'

interface TeacherOption {
  id: string
  full_name: string
}

interface WeekNavProps {
  weekStr: string
  teachers: TeacherOption[]
  teacherId?: string
  currentWeekStr?: string
}

export function WeekNav({ weekStr, teachers, teacherId, currentWeekStr }: WeekNavProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('lessons')
  const uiLocale = parseAppLocale(useLocale())

  function navigate(delta: number) {
    const base = new Date(`${weekStr}T12:00:00Z`)
    const next = new Date(base.getTime() + delta * 7 * 24 * 60 * 60 * 1000)
    const nextStr = next.toISOString().substring(0, 10)
    const params = new URLSearchParams({ week: nextStr })
    if (teacherId) params.set('teacher', teacherId)
    const student = searchParams.get('student')
    if (student) params.set('student', student)
    router.push(`/lessons?${params.toString()}`)
  }

  function onTeacherChange(val: string) {
    const params = new URLSearchParams({ week: weekStr })
    if (val) params.set('teacher', val)
    const student = searchParams.get('student')
    if (student) params.set('student', student)
    router.push(`/lessons?${params.toString()}`)
  }

  const label = formatWeekRangeLabel(weekStr, uiLocale)

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Week navigation — kept LTR so arrow directions stay intuitive */}
      <div className="flex items-center gap-1" dir="ltr">
        {/* "היום" button — shown only when not on current week */}
        {currentWeekStr && weekStr !== currentWeekStr && (
          <Link
            href={(() => {
              const p = new URLSearchParams()
              if (teacherId) p.set('teacher', teacherId)
              const student = searchParams.get('student')
              if (student) p.set('student', student)
              const q = p.toString()
              return q ? `/lessons?${q}` : '/lessons'
            })()}
            className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors ml-1"
          >
            {t('today')}
          </Link>
        )}
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          title={t('series.prevWeek')}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium text-gray-800 min-w-28 sm:min-w-44 text-center">{label}</span>
        <button
          onClick={() => navigate(1)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          title={t('series.nextWeek')}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Teacher filter */}
      <select
        value={teacherId ?? ''}
        onChange={(e) => onTeacherChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
      >
        <option value="">{t('allTeachers')}</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.full_name}
          </option>
        ))}
      </select>
    </div>
  )
}
