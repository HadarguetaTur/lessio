'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createLesson, LessonConflictError } from '@/lib/lessons/createLesson'

const TeacherLessonSchema = z.object({
  student_id:       z.string().uuid(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().refine((v) => [30, 45, 60, 90].includes(v)),
})

export type NewLessonState = { error: string | null }

export async function createTeacherLessonAction(
  _prev: NewLessonState,
  formData: FormData
): Promise<NewLessonState> {
  const { orgId, profileId, role } = await getSession()
  if (role !== 'teacher') return { error: 'אין הרשאה' }

  const teacher = await getTeacherByProfileId(profileId, orgId)
  if (!teacher) return { error: 'לא נמצא פרופיל מורה' }

  const parsed = TeacherLessonSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'נתונים לא תקינים' }

  const { student_id, date, start_time, duration_minutes } = parsed.data

  let lessonId: string
  try {
    const result = await createLesson({
      orgId,
      teacherId: teacher.id,
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
        teacher_conflict: 'יש לך שיעור חופף בשעה זו',
        student_conflict: 'לתלמיד יש שיעור חופף בשעה זו',
      }
      return { error: messages[err.reason] }
    }
    return { error: err instanceof Error ? err.message : 'שגיאה ביצירת השיעור' }
  }
  redirect(`/teacher/schedule/${lessonId}`)
}
