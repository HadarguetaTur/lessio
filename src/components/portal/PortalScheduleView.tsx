'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { PortalCancelDialog } from './PortalCancelDialog'
import type { CancelLessonResult } from '@/app/portal/[orgId]/schedule/actions'

type ScheduleLesson = {
  id: string
  startAt: string
  endAt: string
  status: string
  studentName: string
  teacherName: string
  dateLabel: string
  timeLabel: string
  dayKey: string
}

interface Props {
  upcoming: ScheduleLesson[]
  history: ScheduleLesson[]
  orgId: string
  cancelAction: (lessonId: string) => Promise<CancelLessonResult>
}

// Labels live in portal.schedule.status; only the styling stays here.
const STATUS_CLASS: Record<string, string> = {
  scheduled: 'bg-primary/10 text-primary border-primary/20',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-amber-50 text-amber-700 border-amber-200',
  no_show: 'bg-red-50 text-red-700 border-red-200',
}

export function PortalScheduleView({ upcoming, history, orgId, cancelAction }: Props) {
  const t = useTranslations('portal.schedule')
  const [view, setView] = useState<'upcoming' | 'history'>('upcoming')
  const lessons = view === 'upcoming' ? upcoming : history

  // Group by day
  const grouped = new Map<string, ScheduleLesson[]>()
  for (const lesson of lessons) {
    const group = grouped.get(lesson.dayKey) ?? []
    group.push(lesson)
    grouped.set(lesson.dayKey, group)
  }

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex bg-muted rounded-lg p-0.5">
        <button
          onClick={() => setView('upcoming')}
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
            view === 'upcoming' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('upcoming')}
        </button>
        <button
          onClick={() => setView('history')}
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
            view === 'history' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('history')}
        </button>
      </div>

      {/* Lesson list */}
      {lessons.length === 0 ? (
        <div className="bg-muted/40 rounded-xl border border-border py-10 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-muted-foreground">
            {view === 'upcoming' ? t('noUpcoming') : t('noHistory')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([dayKey, dayLessons]) => (
            <div key={dayKey}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                {dayLessons[0].dateLabel}
              </p>
              <div className="space-y-2">
                {dayLessons.map((lesson) => {
                  const statusKey = lesson.status in STATUS_CLASS ? lesson.status : 'scheduled'
                  return (
                    <div
                      key={lesson.id}
                      className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">
                          {lesson.studentName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {lesson.timeLabel} · {lesson.teacherName}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${STATUS_CLASS[statusKey]}`}>
                          {t(`status.${statusKey}`)}
                        </span>
                        {view === 'upcoming' && lesson.status === 'scheduled' && (
                          <PortalCancelDialog
                            lessonId={lesson.id}
                            studentName={lesson.studentName}
                            lessonDate={lesson.dateLabel}
                            cancelAction={cancelAction}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Book CTA */}
      {view === 'upcoming' && (
        <Link
          href={`/portal/${orgId}/book`}
          className="flex items-center justify-center gap-2 w-full py-3.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          {t('bookNew')}
        </Link>
      )}
    </div>
  )
}
