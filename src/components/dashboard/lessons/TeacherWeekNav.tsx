'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface TeacherWeekNavProps {
  weekStr: string
}

export function TeacherWeekNav({ weekStr }: TeacherWeekNavProps) {
  const router = useRouter()

  function navigate(delta: number) {
    const base = new Date(`${weekStr}T12:00:00Z`)
    const next = new Date(base.getTime() + delta * 7 * 24 * 60 * 60 * 1000)
    const nextStr = next.toISOString().substring(0, 10)
    router.push(`/teacher/schedule?week=${nextStr}`)
  }

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
    <div className="flex items-center gap-1" dir="ltr">
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
  )
}
