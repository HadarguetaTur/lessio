'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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

  function navigate(delta: number) {
    const base = new Date(`${weekStr}T12:00:00Z`)
    const next = new Date(base.getTime() + delta * 7 * 24 * 60 * 60 * 1000)
    const nextStr = next.toISOString().substring(0, 10)
    const params = new URLSearchParams({ week: nextStr })
    if (teacherId) params.set('teacher', teacherId)
    router.push(`/lessons?${params.toString()}`)
  }

  function onTeacherChange(val: string) {
    const params = new URLSearchParams({ week: weekStr })
    if (val) params.set('teacher', val)
    router.push(`/lessons?${params.toString()}`)
  }

  // Week range label: "22–28 במרץ 2026"
  const startDate = new Date(`${weekStr}T12:00:00Z`)
  const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)
  const startDay = startDate.getUTCDate()
  const endDay = endDate.getUTCDate()
  const monthYear = new Intl.DateTimeFormat('he-IL', {
    month: 'long',
    year: 'numeric',
  }).format(endDate)
  const label = `${startDay}–${endDay} ${monthYear}`

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Week navigation — kept LTR so arrow directions stay intuitive */}
      <div className="flex items-center gap-1" dir="ltr">
        {/* "היום" button — shown only when not on current week */}
        {currentWeekStr && weekStr !== currentWeekStr && (
          <Link
            href={`/lessons${teacherId ? `?teacher=${teacherId}` : ''}`}
            className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors ml-1"
          >
            היום
          </Link>
        )}
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          title="שבוע קודם"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium text-gray-800 min-w-44 text-center">{label}</span>
        <button
          onClick={() => navigate(1)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          title="שבוע הבא"
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
        <option value="">כל המורים</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.full_name}
          </option>
        ))}
      </select>
    </div>
  )
}
