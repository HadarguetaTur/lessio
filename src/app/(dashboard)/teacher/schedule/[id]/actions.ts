'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getLessonById, updateLessonStatus, LessonStatus } from '@/lib/lessons'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createLessonCharge } from '@/lib/billing/createCharge'

const ALLOWED_STATUSES: LessonStatus[] = ['completed', 'no_show']

export type TeacherOutcomeResult = {
  error: string | null
  chargeAlert?: string
}

export async function updateTeacherLessonOutcome(
  lessonId: string,
  _prevState: TeacherOutcomeResult,
  formData: FormData
): Promise<TeacherOutcomeResult> {
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)

  if (role !== 'teacher') {
    return { error: 'אין הרשאה לפעולה זו' }
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    return { error: 'לא נמצאה רשומת מורה פעילה עבור משתמש זה' }
  }

  const status = formData.get('status') as LessonStatus | null
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return { error: 'סטטוס לא חוקי. ניתן לעדכן להושלם או לא הגיע בלבד' }
  }

  const lesson = await getLessonById(lessonId, orgId)
  if (!lesson) {
    return { error: 'validation.lessonNotFound' }
  }

  // Enforce ownership — teacher may only update their own lessons
  if (lesson.teacher.id !== teacher.id) {
    return { error: 'אין הרשאה לעדכן שיעור זה' }
  }

  if (lesson.status === 'cancelled') {
    return { error: 'לא ניתן לשנות סטטוס של שיעור שבוטל' }
  }

  if (lesson.status === status) {
    return { error: null }
  }

  try {
    await updateLessonStatus(lessonId, orgId, status)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'שגיאה בעדכון הסטטוס' }
  }

  revalidatePath(`/teacher/schedule/${lessonId}`)
  revalidatePath('/teacher/schedule')

  // Preserve existing Sprint 3 charge flow — do not redefine billing rules
  if (status === 'completed') {
    const alert = await createLessonCharge(lessonId, orgId)
    if (alert) {
      return { error: null, chargeAlert: alert.message }
    }
  }

  return { error: null }
}
