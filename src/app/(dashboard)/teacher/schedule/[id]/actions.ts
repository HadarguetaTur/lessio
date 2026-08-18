'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getLessonById, updateLessonStatus, LessonStatus } from '@/lib/lessons'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createLessonCharge } from '@/lib/billing/createCharge'
import { getTranslations } from 'next-intl/server'

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
  const t = await getTranslations()
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)

  if (role !== 'teacher') {
    return { error: t('teacherSelf.errors.noPermission') }
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    return { error: t('teacherSelf.errors.noActiveTeacherRecord') }
  }

  const status = formData.get('status') as LessonStatus | null
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return { error: t('teacherSelf.errors.invalidStatus') }
  }

  const lesson = await getLessonById(lessonId, orgId)
  if (!lesson) {
    return { error: 'validation.lessonNotFound' }
  }

  // Enforce ownership — teacher may only update their own lessons
  if (lesson.teacher.id !== teacher.id) {
    return { error: t('teacherSelf.errors.cannotUpdateLesson') }
  }

  if (lesson.status === 'cancelled') {
    return { error: t('teacherSelf.errors.lessonCancelled') }
  }

  if (lesson.status === status) {
    return { error: null }
  }

  try {
    await updateLessonStatus(lessonId, orgId, status)
  } catch (e) {
    return { error: t('teacherSelf.errors.statusUpdateFailed') }
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
