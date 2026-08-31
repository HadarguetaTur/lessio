'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatWeekRangeLabel, parseAppLocale } from '@/lib/i18n/locale'
import { preserveCalendarParams } from './calendarParams'

interface TeacherOption {
  id: string
  full_name: string
}

interface WeekNavProps {
  weekStr: string
  teachers: TeacherOption[]
  teacherId?: string
  currentWeekStr?: string
  scheduleBasePath?: string
  /** When false, hide the teacher filter (e.g. teacher viewing only their own schedule). */
  showTeacherFilter?: boolean
}

export function WeekNav({
  weekStr,
  teachers,
  teacherId,
  currentWeekStr,
  scheduleBasePath = '/lessons',
  showTeacherFilter = true,
}: WeekNavProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('lessons')
  const uiLocale = parseAppLocale(useLocale())

  function navigate(delta: number) {
    const base = new Date(`${weekStr}T12:00:00Z`)
    const next = new Date(base.getTime() + delta * 7 * 24 * 60 * 60 * 1000)
    const nextStr = next.toISOString().substring(0, 10)
    const params = new URLSearchParams({ week: nextStr })
    if (scheduleBasePath === '/lessons' && teacherId) params.set('teacher', teacherId)
    preserveCalendarParams(searchParams, params)
    router.push(`${scheduleBasePath}?${params.toString()}`)
  }

  function onTeacherChange(val: string) {
    const params = new URLSearchParams({ week: weekStr })
    if (val) params.set('teacher', val)
    preserveCalendarParams(searchParams, params)
    router.push(`${scheduleBasePath}?${params.toString()}`)
  }

  const label = formatWeekRangeLabel(weekStr, uiLocale)

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
      {/* Week navigation — kept LTR so arrow directions stay intuitive */}
      <div className="flex min-w-0 items-center justify-center gap-1 sm:justify-start" dir="ltr">
        {/* "היום" button — shown only when not on current week */}
        {currentWeekStr && weekStr !== currentWeekStr && (
          <Link
            href={(() => {
              const p = new URLSearchParams()
              if (scheduleBasePath === '/lessons' && teacherId) p.set('teacher', teacherId)
              preserveCalendarParams(searchParams, p)
              if (scheduleBasePath === '/teacher/schedule' && currentWeekStr) {
                p.set('week', currentWeekStr)
              }
              const q = p.toString()
              return q ? `${scheduleBasePath}?${q}` : scheduleBasePath
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
      {showTeacherFilter ? (
        <select
          value={teacherId ?? ''}
          onChange={(e) => onTeacherChange(e.target.value)}
          aria-label={t('allTeachers')}
          className="w-full min-w-0 text-sm border border-gray-200 rounded-md px-2 py-1.5 text-center bg-white text-gray-700 sm:w-auto sm:max-w-xs sm:text-start"
        >
          <option value="">{t('allTeachers')}</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
