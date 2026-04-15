'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createLesson, LessonConflictError } from '@/lib/lessons/createLesson'

const lessonStatusZ = z.enum(['scheduled', 'completed', 'cancelled', 'no_show'])

const IndividualLessonSchema = z.object({
  lesson_type:      z.literal('individual'),
  teacher_id:       z.string().uuid(),
  student_id:       z.string().uuid(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().refine((v) => [30, 45, 60, 90].includes(v)),
  status:           lessonStatusZ,
})

const GroupLessonSchema = z.object({
  lesson_type:      z.literal('group'),
  teacher_id:       z.string().uuid(),
  student_ids:      z.array(z.string().uuid()).min(1, 'יש לבחור קבוצה עם לפחות תלמיד אחד'),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time:       z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().refine((v) => [30, 45, 60, 90].includes(v)),
  status:           lessonStatusZ,
  price_per_student: z.coerce.number().positive().optional().nullable(),
})

export type NewLessonState = { error: string | null; success?: boolean }

async function assertStudentsAssignedToTeacher(
  orgId: string,
  teacherId: string,
  studentIds: string[]
): Promise<string | null> {
  if (studentIds.length === 0) return 'נתונים לא תקינים'
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('students')
    .select('id, teacher_id')
    .eq('organization_id', orgId)
    .in('id', studentIds)
  if (error) return 'שגיאה בבדיקת תלמידים'
  if (!data || data.length !== studentIds.length) return 'תלמיד לא נמצא'
  const bad = data.some((r) => r.teacher_id !== teacherId)
  if (bad) return 'ניתן לקבוע שיעור רק לתלמידים המשויכים אליך'
  return null
}

export async function createLessonAction(
  _prev: NewLessonState,
  formData: FormData
): Promise<NewLessonState> {
  const { orgId, role, profileId } = await getSession()
  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }

  const rawType = formData.get('lesson_type') as string | null
  const lessonType = rawType === 'group' ? 'group' : 'individual'

  let lessonId: string

  try {
    if (role === 'teacher') {
      const teacher = await getTeacherByProfileId(profileId, orgId, { activeOnly: true })
      if (!teacher) return { error: 'לא נמצא פרופיל מורה פעיל' }
      if (lessonType === 'group') {
        return { error: 'שיעורים קבוצתיים זמינים רק למנהל המערכת' }
      }
      const parsed = IndividualLessonSchema.safeParse({
        lesson_type: 'individual',
        teacher_id: formData.get('teacher_id'),
        student_id: formData.get('student_id'),
        date: formData.get('date'),
        start_time: formData.get('start_time'),
        duration_minutes: formData.get('duration_minutes'),
        status: formData.get('status'),
      })
      if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' }

      const { teacher_id, student_id, date, start_time, duration_minutes, status } = parsed.data
      if (teacher_id !== teacher.id) return { error: 'אין הרשאה' }
      const assignErr = await assertStudentsAssignedToTeacher(orgId, teacher.id, [student_id])
      if (assignErr) return { error: assignErr }

      const result = await createLesson({
        orgId,
        teacherId: teacher_id,
        studentIds: [student_id],
        lessonType: 'individual',
        date,
        startTime: start_time,
        durationMinutes: duration_minutes,
        createdByProfileId: profileId,
        status,
      })
      lessonId = result.lessonId
    } else if (lessonType === 'group') {
      const studentIds = formData.getAll('student_ids').map(String)
      const rawPrice = formData.get('price_per_student')
      const parsed = GroupLessonSchema.safeParse({
        lesson_type: 'group',
        teacher_id: formData.get('teacher_id'),
        student_ids: studentIds,
        date: formData.get('date'),
        start_time: formData.get('start_time'),
        duration_minutes: formData.get('duration_minutes'),
        status: formData.get('status'),
        price_per_student: rawPrice && String(rawPrice).trim() ? rawPrice : null,
      })
      if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' }

      const { teacher_id, student_ids, date, start_time, duration_minutes, status, price_per_student } =
        parsed.data
      const result = await createLesson({
        orgId,
        teacherId: teacher_id,
        studentIds: student_ids,
        lessonType: 'group',
        date,
        startTime: start_time,
        durationMinutes: duration_minutes,
        createdByProfileId: profileId,
        status,
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
        status: formData.get('status'),
      })
      if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים' }

      const { teacher_id, student_id, date, start_time, duration_minutes, status } = parsed.data
      const result = await createLesson({
        orgId,
        teacherId: teacher_id,
        studentIds: [student_id],
        lessonType: 'individual',
        date,
        startTime: start_time,
        durationMinutes: duration_minutes,
        createdByProfileId: profileId,
        status,
      })
      lessonId = result.lessonId
    }
  } catch (err) {
    if (err instanceof LessonConflictError) {
      const teacherConflict =
        role === 'teacher'
          ? 'יש לך שיעור חופף בשעה זו'
          : 'למורה יש שיעור חופף בשעה זו'
      const messages: Record<typeof err.reason, string> = {
        holiday:          'התאריך הנבחר הוא חג — לא ניתן לקבוע שיעור',
        teacher_conflict: teacherConflict,
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

  if (role === 'teacher') {
    redirect(`/teacher/schedule/${lessonId}`)
  }
  redirect(`/lessons/${lessonId}`)
}
