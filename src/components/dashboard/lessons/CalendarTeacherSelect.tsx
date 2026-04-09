'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface CalendarTeacherSelectProps {
  teachers: { id: string; full_name: string }[]
  teacherId?: string
  view: 'day' | 'month'
  dateStr?: string
  monthStr?: string
}

export function CalendarTeacherSelect({
  teachers,
  teacherId,
  view,
  dateStr,
  monthStr,
}: CalendarTeacherSelectProps) {
  const t = useTranslations('lessons')
  const router = useRouter()
  const searchParams = useSearchParams()

  function onChange(val: string) {
    const params = new URLSearchParams({ view })
    if (val) params.set('teacher', val)
    if (view === 'day' && dateStr) params.set('date', dateStr)
    if (view === 'month' && monthStr) params.set('month', monthStr)
    const student = searchParams.get('student')
    if (student) params.set('student', student)
    router.push(`/lessons?${params.toString()}`)
  }

  return (
    <select
      value={teacherId ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
    >
      <option value="">{t('allTeachers')}</option>
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.full_name}
        </option>
      ))}
    </select>
  )
}
