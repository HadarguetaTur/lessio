'use server'

/**
 * Schedule-exception actions for the session's own teacher record.
 * teacherId is always resolved from the authenticated session — never from the
 * request. Per /docs/sprint-10-scope.md § Story 5.
 *
 * Also serves an owner/admin who teaches: a solo tutor's sidebar hides the
 * teacher-management section, so this is their only route to their own
 * exceptions. The teacher row still comes from the session, so the wider role
 * gate grants nobody access to anyone else's calendar.
 */

import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import {
  createOverride,
  deleteOverride,
  updateOverride,
  type ConflictingLesson,
  type OverrideCreateResult,
} from '@/lib/availability-overrides'
import { overrideErrorMessage } from '@/lib/availability-overrides/errorMessage'
import { revalidatePath } from 'next/cache'
import { commonError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

type ActionState = {
  error?: string
  /** Lessons already booked inside the range the reader is about to close. */
  needsLessonConfirm?: boolean
  lessons?: ConflictingLesson[]
  cancelled?: number
  notified?: number
} | null

/** Maps the mutation result onto the state the form renders. */
async function toState(result: OverrideCreateResult): Promise<ActionState> {
  if (!result) return null
  if ('needsLessonConfirm' in result) {
    return { needsLessonConfirm: true, lessons: result.lessons }
  }
  if ('created' in result) {
    return { cancelled: result.cancelled, notified: result.notified }
  }
  return { error: await overrideErrorMessage(result) }
}

/** Resolves the acting user's own teacher row, or the error to show instead. */
async function ownTeacher(): Promise<
  { teacherId: string; orgId: string; teacherName: string | null } | { error: string }
> {
  const t = await getTranslations()
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)

  if (role !== 'teacher' && role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) return { error: t('teacherSelf.errors.noTeacherRecord') }

  return { teacherId: teacher.id, orgId, teacherName: teacher.profile.full_name ?? null }
}

export async function addTeacherOverride(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const result = await createOverride(who.orgId, who.teacherId, formData, who.teacherName)
  const state = await toState(result)
  // Nothing was written when the reader still has to decide about the lessons.
  if (state?.needsLessonConfirm) return state

  revalidatePath('/teacher/overrides')
  return state
}

export async function updateTeacherOverride(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const failure = await updateOverride(who.orgId, who.teacherId, formData)
  if (failure) return { error: await overrideErrorMessage(failure) }

  revalidatePath('/teacher/overrides')
  return null
}

export async function deleteTeacherOverride(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const failure = await deleteOverride(who.orgId, who.teacherId, formData)
  if (failure) return { error: await overrideErrorMessage(failure) }

  revalidatePath('/teacher/overrides')
  return null
}
