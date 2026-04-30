'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

type CalendarView = 'day' | 'week' | 'month'

interface ViewToggleProps {
  currentView: CalendarView
  currentDate: string   // YYYY-MM-DD (for day view)
  currentWeek: string   // YYYY-MM-DD (sunday of current week)
  currentMonth: string  // YYYY-MM
  /** Default `/lessons`. Use `/teacher/schedule` for teacher self-service calendar. */
  scheduleBasePath?: string
  teacherId?: string
}

export function ViewToggle({
  currentView,
  currentDate,
  currentWeek,
  currentMonth,
  scheduleBasePath = '/lessons',
  teacherId,
}: ViewToggleProps) {
  const t = useTranslations('lessons')
  const router = useRouter()
  const searchParams = useSearchParams()

  const VIEWS: { id: CalendarView; label: string }[] = [
    { id: 'day',   label: t('viewDay') },
    { id: 'week',  label: t('viewWeek') },
    { id: 'month', label: t('viewMonth') },
  ]

  function switchView(view: CalendarView) {
    const params = new URLSearchParams()
    params.set('view', view)
    if (scheduleBasePath === '/lessons' && teacherId) params.set('teacher', teacherId)
    const student = searchParams.get('student')
    if (student) params.set('student', student)

    if (view === 'day') {
      // preserve the currently visible date if possible
      const date = searchParams.get('date') ?? currentDate
      params.set('date', date)
    } else if (view === 'week') {
      params.set('week', currentWeek)
    } else {
      params.set('month', currentMonth)
    }

    router.push(`${scheduleBasePath}?${params.toString()}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5 sm:mx-0 sm:inline-flex sm:max-w-none sm:w-auto sm:flex-row">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => switchView(v.id)}
          className={`w-full px-3 py-2 text-center text-sm font-medium rounded-md transition-colors sm:w-auto sm:py-1 ${
            currentView === v.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
