'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { createLesson, LessonConflictError } from '@/lib/lessons/createLesson'

const IndividualLessonSchema = z.object({
  lesson_type:      z.literal('individual'),
  teacher_id:       z.string().uuid(),
  student_id:       z.string().uuid(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().refine((v) => [30, 45, 60, 90].includes(v)),
})

const GroupLessonSchema = z.object({
  lesson_type:      z.literal('group'),
  teacher_id:       z.string().uuid(),
  student_ids:      z.array(z.string().uuid()).min(1, 'יש לבחור קבוצה עם לפחות תלמיד אחד'),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().refine((v) => [30, 45, 60, 90].includes(v)),
  price_per_student: z.coerce.number().positive().optional().nullable(),
})

export type NewLessonState = { error: string | null; success?: boolean }

export async function createLessonAction(
  _prev: NewLessonState,
  formData: FormData
): Promise<NewLessonState> {
  const { orgId, role, profileId } = await getSession()
  if (role !== 'owner' && role !== 'admin') return { error: 'אין הרשאה' }

  const rawType = formData.get('lesson_type') as string | null
  const lessonType = rawType === 'group' ? 'group' : 'individual'

  let lessonId: string

  try {
    if (lessonType === 'group') {
      const studentIds = formData.getAll('student_ids').map(String)
      const rawPrice = formData.get('price_per_student')
      const parsed = GroupLessonSchema.safeParse({
        lesson_type: 'group',
        teacher_id: formData.get('teacher_id'),
        student_ids: studentIds,
        date: formData.get('date'),
        start_time: formData.get('start_time'),
        duration_minutes: formData.get('duration_minutes'),
        price_per_student: rawPrice && String(rawPrice).trim() ? rawPrice : null,
      })
      if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' }

      const { teacher_id, student_ids, date, start_time, duration_minutes, price_per_student } = parsed.data
      const result = await createLesson({
        orgId,
        teacherId: teacher_id,
        studentIds: student_ids,
        lessonType: 'group',
        date,
        startTime: start_time,
        durationMinutes: duration_minutes,
        createdByProfileId: profileId,
        pricePerStudent: price_per_student,
      })
      lessonId = result.lessonId
    } else {
      const parsed = IndividualLessonSchema.safeParse({
        lesson_type: 'individual',
        teacher_id: formData.get('teacher_id'),
        student_id: formData.get('student_id'),
        date: formData.get('date'),
        start_time: formData.get('start_time'),
        duration_minutes: formData.get('duration_minutes'),
      })
      if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' }

      const { teacher_id, student_id, date, start_time, duration_minutes } = parsed.data
      const result = await createLesson({
        orgId,
        teacherId: teacher_id,
        studentIds: [student_id],
        lessonType: 'individual',
        date,
        startTime: start_time,
        durationMinutes: duration_minutes,
        createdByProfileId: profileId,
      })
      lessonId = result.lessonId
    }
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

  const calendarFlow = formData.get('calendar_flow') === '1'
  if (calendarFlow) {
    return { error: null, success: true }
  }

  redirect(`/lessons/${lessonId}`)
}
