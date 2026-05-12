'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import { requireQuotaCapacity } from '@/lib/saas/quota'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createLesson, LessonConflictError } from '@/lib/lessons/createLesson'
import { checkTeacherAvailability } from '@/lib/availability/checkTeacherAvailability'

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

export type NewLessonState = {
  error: string | null
  success?: boolean
  /**
   * Set when the requested slot is outside the teacher's availability windows.
   * The UI surfaces a confirmation dialog; resubmitting with
   * `confirm_outside_availability=1` skips the soft check.
   */
  needsAvailabilityConfirm?: boolean
}

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
  const session = await getSession()
  const { orgId, role, profileId } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin' && role !== 'teacher') {
    return { error: 'אין הרשאה' }
  }
  await requireQuotaCapacity(orgId, 'lessons_monthly')

  const rawType = formData.get('lesson_type') as string | null
  const lessonType = rawType === 'group' ? 'group' : 'individual'
  const confirmedOutsideAvailability =
    formData.get('confirm_outside_availability') === '1'

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
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

      const { teacher_id, student_id, date, start_time, duration_minutes, status } = parsed.data
      if (teacher_id !== teacher.id) return { error: 'אין הרשאה' }
      const assignErr = await assertStudentsAssignedToTeacher(orgId, teacher.id, [student_id])
      if (assignErr) return { error: assignErr }

      if (!confirmedOutsideAvailability && status === 'scheduled') {
        const avail = await assertWithinTeacherAvailability({
          orgId,
          teacherId: teacher_id,
          date,
          startTime: start_time,
          durationMinutes: duration_minutes,
        })
        if (avail) return avail
      }

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
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

      const { teacher_id, student_ids, date, start_time, duration_minutes, status, price_per_student } =
        parsed.data

      if (!confirmedOutsideAvailability && status === 'scheduled') {
        const avail = await assertWithinTeacherAvailability({
          orgId,
          teacherId: teacher_id,
          date,
          startTime: start_time,
          durationMinutes: duration_minutes,
        })
        if (avail) return avail
      }

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
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

      const { teacher_id, student_id, date, start_time, duration_minutes, status } = parsed.data

      if (!confirmedOutsideAvailability && status === 'scheduled') {
        const avail = await assertWithinTeacherAvailability({
          orgId,
          teacherId: teacher_id,
          date,
          startTime: start_time,
          durationMinutes: duration_minutes,
        })
        if (avail) return avail
      }

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
    // The calendar sheet keeps the user on the same page and just re-fetches.
    // Without explicit revalidation Next.js may serve a cached payload and the
    // new lesson appears to be missing from the grid.
    revalidatePath('/lessons')
    revalidatePath('/teacher/schedule')
    return { error: null, success: true }
  }

  if (role === 'teacher') {
    redirect(`/teacher/schedule/${lessonId}`)
  }
  redirect(`/lessons/${lessonId}`)
}

/**
 * Helper: returns a `NewLessonState` describing the availability conflict, or
 * null when the slot fits inside the teacher's availability. Used by every
 * branch of `createLessonAction` before persisting.
 */
async function assertWithinTeacherAvailability(params: {
  orgId: string
  teacherId: string
  date: string
  startTime: string
  durationMinutes: number
}): Promise<NewLessonState | null> {
  const result = await checkTeacherAvailability(params)

  if (result.status === 'inside') return null

  // No availability defined at all — don't block. Schools onboarding often
  // skip the recurring availability step; we only warn when there *is* data
  // that conflicts with the request.
  if (result.status === 'no_windows') return null

  const messages: Record<'outside_windows' | 'override_unavailable' | 'partial_override', string> = {
    outside_windows: 'המורה לא זמין בשעה זו. האם לקבוע את השיעור בכל זאת?',
    override_unavailable:
      'המורה סימן את התאריך הזה כלא זמין. האם לקבוע את השיעור בכל זאת?',
    partial_override:
      'השעה המבוקשת חורגת מחלון הזמינות שהוגדר לתאריך זה. האם לקבוע את השיעור בכל זאת?',
  }

  return {
    error: messages[result.status],
    needsAvailabilityConfirm: true,
  }
}
