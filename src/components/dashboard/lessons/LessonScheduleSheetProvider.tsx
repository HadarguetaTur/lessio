'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { NewLessonSheet } from './NewLessonSheet'
import type { ScheduleFormResources } from './scheduleFormTypes'
import { LESSON_FORM_MIN_DATE_STR } from '@/lib/lessons/lessonFormDates'

export type LessonScheduleSheetContextValue = {
  /** Calendar day tap: opens new-lesson sheet for that local date (including past). */
  openWithDate: (dateStr: string) => void
  /** Header "new lesson": uses header default date for the current view (e.g. day in view). */
  openNewLessonFromHeader: () => void
}

const LessonScheduleSheetContext = createContext<LessonScheduleSheetContextValue | null>(null)

export function useLessonScheduleSheet(): LessonScheduleSheetContextValue {
  const ctx = useContext(LessonScheduleSheetContext)
  if (!ctx) {
    throw new Error('useLessonScheduleSheet must be used within LessonScheduleSheetProvider')
  }
  return ctx
}

type ProviderProps = {
  children: ReactNode
  /** Default date when opening "new lesson" from the header (e.g. day in view). */
  headerDefaultDate: string
  /** When set (owner/admin or teacher with roster), enables day-tap + new-lesson sheet. */
  scheduleForm: ScheduleFormResources | null
  defaultTeacherId?: string
  /** Teachers only: individual lessons; hide group flow in the sheet. */
  allowGroupLessons?: boolean
}

export function LessonScheduleSheetProvider({
  children,
  headerDefaultDate,
  scheduleForm,
  defaultTeacherId,
  allowGroupLessons = true,
}: ProviderProps) {
  const [open, setOpen] = useState(false)
  const [pickedDate, setPickedDate] = useState<string | null>(null)

  const openWithDate = useCallback(
    (dateStr: string) => {
      if (!scheduleForm) return
      setPickedDate(dateStr)
      setOpen(true)
    },
    [scheduleForm]
  )

  const openNewLessonFromHeader = useCallback(() => {
    if (!scheduleForm) return
    setPickedDate(headerDefaultDate)
    setOpen(true)
  }, [scheduleForm, headerDefaultDate])

  const value = useMemo(
    () => ({ openWithDate, openNewLessonFromHeader }),
    [openWithDate, openNewLessonFromHeader]
  )

  const sheetInitial = pickedDate ?? headerDefaultDate

  return (
    <LessonScheduleSheetContext.Provider value={value}>
      {children}
      {scheduleForm ? (
        <NewLessonSheet
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) setPickedDate(null)
          }}
          initialDate={sheetInitial}
          minDateStr={LESSON_FORM_MIN_DATE_STR}
          teachers={scheduleForm.teachers}
          students={scheduleForm.students}
          groups={scheduleForm.groups}
          defaultTeacherId={defaultTeacherId}
          allowGroupLessons={allowGroupLessons}
        />
      ) : null}
    </LessonScheduleSheetContext.Provider>
  )
}
