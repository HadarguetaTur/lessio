'use client'

import Link from 'next/link'
import { Repeat, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLessonScheduleSheet } from './LessonScheduleSheetProvider'

type Labels = {
  import: string
  newSeries: string
  newLesson: string
}

export function LessonsScheduleHeaderActions({
  labels,
  variant = 'admin',
}: {
  labels: Labels
  variant?: 'admin' | 'teacher'
}) {
  const { openNewLessonFromHeader } = useLessonScheduleSheet()

  return (
    <div className="flex max-w-full min-w-0 justify-center overflow-x-auto overflow-y-hidden pb-1 overscroll-x-contain touch-pan-x sm:justify-start">
      <div className="flex w-max max-w-none flex-nowrap items-center gap-2">
        {variant === 'admin' ? (
          <>
            <Link href="/lessons/import" className="shrink-0">
              <Button variant="outline" size="sm">
                <Upload size={14} className="ml-1.5" />
                {labels.import}
              </Button>
            </Link>
            <Link href="/lessons/new-series" className="shrink-0">
              <Button variant="outline" size="sm">
                <Repeat size={14} className="ml-1.5" />
                {labels.newSeries}
              </Button>
            </Link>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={() => openNewLessonFromHeader()}
        >
          <Plus size={14} className="ml-1.5" />
          {labels.newLesson}
        </Button>
      </div>
    </div>
  )
}
