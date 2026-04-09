'use client'

import { useCallback, useState } from 'react'
import { WeekViewClient } from './WeekViewClient'
import { MonthViewClient } from './MonthViewClient'
import type { WeekCalendarPayload } from './WeekView'
import type { MonthCalendarPayload } from './MonthView'
import type { StudentGroup } from '@/lib/groups'
import { NewLessonSheet } from './NewLessonSheet'

export type ScheduleFormResources = {
  teachers: { id: string; full_name: string }[]
  students: { id: string; full_name: string }[]
  groups: StudentGroup[]
}

type Props =
  | {
      variant: 'week'
      todayStr: string
      calendar: WeekCalendarPayload
      isAdmin: boolean
      scheduleForm: ScheduleFormResources | null
      defaultTeacherId?: string
    }
  | {
      variant: 'month'
      todayStr: string
      calendar: MonthCalendarPayload
      isAdmin: boolean
      scheduleForm: ScheduleFormResources | null
      defaultTeacherId?: string
    }

export function LessonsScheduleSection(props: Props) {
  const [open, setOpen] = useState(false)
  const [pickedDate, setPickedDate] = useState<string | null>(null)

  const handlePickDay = useCallback(
    (dateStr: string) => {
      if (dateStr < props.todayStr) return
      setPickedDate(dateStr)
      setOpen(true)
    },
    [props.todayStr]
  )

  const scheduleSheet =
    props.isAdmin && props.scheduleForm ? (
      <NewLessonSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setPickedDate(null)
        }}
        initialDate={pickedDate ?? props.todayStr}
        minDateStr={props.todayStr}
        teachers={props.scheduleForm.teachers}
        students={props.scheduleForm.students}
        groups={props.scheduleForm.groups}
        defaultTeacherId={props.defaultTeacherId}
      />
    ) : null

  if (props.variant === 'week') {
    return (
      <>
        <WeekViewClient
          {...props.calendar}
          pickDayEnabled={props.isAdmin}
          onPickDay={props.isAdmin ? handlePickDay : undefined}
        />
        {scheduleSheet}
      </>
    )
  }

  return (
    <>
      <MonthViewClient
        {...props.calendar}
        pickDayEnabled={props.isAdmin}
        onPickDay={props.isAdmin ? handlePickDay : undefined}
      />
      {scheduleSheet}
    </>
  )
}
