'use server'

import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherById } from '@/lib/teachers'
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

export async function createOverrideAction(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  const teacher = await getTeacherById(teacherId, orgId)
  const result = await createOverride(
    orgId,
    teacherId,
    formData,
    teacher?.profile.full_name ?? null
  )
  const state = await toState(result)
  // Nothing was written when the reader still has to decide about the lessons.
  if (state?.needsLessonConfirm) return state

  revalidatePath(`/teachers/${teacherId}/overrides`)
  return state
}

export async function updateOverrideAction(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  const failure = await updateOverride(orgId, teacherId, formData)
  if (failure) return { error: await overrideErrorMessage(failure) }

  revalidatePath(`/teachers/${teacherId}/overrides`)
  return null
}

export async function deleteOverrideAction(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  const failure = await deleteOverride(orgId, teacherId, formData)
  if (failure) return { error: await overrideErrorMessage(failure) }

  revalidatePath(`/teachers/${teacherId}/overrides`)
  return null
}
