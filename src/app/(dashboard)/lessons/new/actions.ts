'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { createLesson, LessonConflictError } from '@/lib/lessons/createLesson'

const NewLessonSchema = z.object({
  teacher_id:       z.string().uuid(),
  student_id:       z.string().uuid(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().refine((v) => [30, 45, 60, 90].includes(v)),
})

export type NewLessonState = { error: string | null }

export async function createLessonAction(
  _prev: NewLessonState,
  formData: FormData
): Promise<NewLessonState> {
  const { orgId, role, profileId } = await getSession()
  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה' }

  const parsed = NewLessonSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  const { teacher_id, student_id, date, start_time, duration_minutes } = parsed.data

  let lessonId: string
  try {
    const result = await createLesson({
      orgId,
      teacherId: teacher_id,
      studentId: student_id,
      date,
      startTime: start_time,
      durationMinutes: duration_minutes,
      createdByProfileId: profileId,
    })
    lessonId = result.lessonId
  } catch (err) {
    if (err instanceof LessonConflictError) {
      const messages: Record<typeof err.reason, string> = {
        holiday:          'התאריך הנבחר הוא חג — לא ניתן לקבוע שיעור',
        teacher_conflict: 'למורה יש שיעור חופף בשעה זו',
        student_conflict: 'לתלמיד יש שיעור חופף בשעה זו',
      }
      return { error: messages[err.reason] }
    }
    return { error: err instanceof Error ? err.message : 'שגיאה ביצירת השיעור' }
  }
  redirect(`/lessons/${lessonId}`)
}
