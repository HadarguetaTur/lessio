'use client'

import { WeekViewClient } from './WeekViewClient'
import { MonthViewClient } from './MonthViewClient'
import type { WeekCalendarPayload } from './WeekView'
import type { MonthCalendarPayload } from './MonthView'
import { useLessonScheduleSheet } from './LessonScheduleSheetProvider'
import type { ScheduleFormResources } from './scheduleFormTypes'

export type { ScheduleFormResources } from './scheduleFormTypes'

type Props =
  | {
      variant: 'week'
      todayStr: string
      calendar: WeekCalendarPayload
      scheduleForm: ScheduleFormResources | null
      defaultTeacherId?: string
    }
  | {
      variant: 'month'
      todayStr: string
      calendar: MonthCalendarPayload
      scheduleForm: ScheduleFormResources | null
      defaultTeacherId?: string
    }

export function LessonsScheduleSection(props: Props) {
  const { openWithDate } = useLessonScheduleSheet()

  const onPickDay = props.scheduleForm ? openWithDate : undefined

  if (props.variant === 'week') {
    return (
      <WeekViewClient
        {...props.calendar}
        pickDayEnabled={Boolean(onPickDay)}
        onPickDay={onPickDay}
      />
    )
  }

  return (
    <MonthViewClient
      {...props.calendar}
      pickDayEnabled={Boolean(onPickDay)}
      onPickDay={onPickDay}
    />
  )
}
