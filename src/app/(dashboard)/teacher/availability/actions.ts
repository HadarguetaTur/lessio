'use server'

/**
 * Availability actions for the session's own teacher record.
 * teacherId is always resolved from the authenticated session — never from the
 * request. Per /docs/sprint-10-scope.md § Story 4.
 *
 * Also serves an owner/admin who teaches: a solo tutor's sidebar hides the
 * whole teacher-management section, so this is their only route to their own
 * weekly grid. The teacher row still comes from the session, so the wider role
 * gate grants nobody access to anyone else's availability.
 */

import { getSession, requireMutation } from '@/lib/auth/session'
import { getTeacherByProfileId } from '@/lib/teachers'
import {
  createAvailabilityWindows,
  deleteAvailabilityWindow,
  updateAvailabilityWindow,
} from '@/lib/availability'
import { revalidatePath } from 'next/cache'
import { commonError } from '@/lib/i18n/actionErrors'
import { availabilityErrorMessage } from '@/lib/availability/errorMessage'
import { setTeacherBreakMinutes } from '@/lib/scheduling/breaks'
import { breakErrorMessage, tailErrorMessage } from '@/lib/scheduling/errorMessage'
import {
  blockTailPrompt,
  dismissTailPrompt,
  extendTailPrompt,
} from '@/lib/scheduling/tailPrompts'
import { getTranslations } from 'next-intl/server'

type ActionState = { error: string } | null

/** Resolves the acting user's own teacher row, or the error to show instead. */
async function ownTeacher(): Promise<
  { teacherId: string; orgId: string; userId: string } | { error: string }
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

  return { teacherId: teacher.id, orgId, userId }
}

export async function addTeacherAvailability(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const failure = await createAvailabilityWindows(who.orgId, who.teacherId, formData)
  if (failure) return { error: await availabilityErrorMessage(failure) }

  revalidatePath('/teacher/availability')
  return null
}

export async function updateTeacherAvailability(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const failure = await updateAvailabilityWindow(who.orgId, who.teacherId, formData)
  if (failure) return { error: await availabilityErrorMessage(failure) }

  revalidatePath('/teacher/availability')
  return null
}

export async function deleteTeacherAvailability(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const failure = await deleteAvailabilityWindow(who.orgId, who.teacherId, formData)
  if (failure) return { error: await availabilityErrorMessage(failure) }

  revalidatePath('/teacher/availability')
  return null
}

export async function saveOwnBreakDuration(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const failure = await setTeacherBreakMinutes(
    who.orgId,
    who.teacherId,
    formData.get('break_duration_minutes')
  )
  if (failure) return { error: await breakErrorMessage(failure) }

  revalidatePath('/teacher/availability')
  return null
}

// ── Leftover-time prompts ────────────────────────────────────────────────────
// Scoped by the session's own teacher id, so a prompt raised for someone else
// cannot be answered here even with its id.

export async function blockOwnTail(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const failure = await blockTailPrompt({
    orgId: who.orgId,
    promptId: String(formData.get('prompt_id') ?? ''),
    resolvedBy: who.userId,
    teacherId: who.teacherId,
  })
  if (failure) return { error: await tailErrorMessage(failure) }

  revalidatePath('/teacher/availability')
  return null
}

export async function extendOwnTail(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const failure = await extendTailPrompt({
    orgId: who.orgId,
    promptId: String(formData.get('prompt_id') ?? ''),
    newEndTime: String(formData.get('new_end_time') ?? ''),
    resolvedBy: who.userId,
    teacherId: who.teacherId,
  })
  if (failure) return { error: await tailErrorMessage(failure) }

  revalidatePath('/teacher/availability')
  return null
}

export async function dismissOwnTail(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await ownTeacher()
  if ('error' in who) return who

  const failure = await dismissTailPrompt({
    orgId: who.orgId,
    promptId: String(formData.get('prompt_id') ?? ''),
    resolvedBy: who.userId,
    teacherId: who.teacherId,
  })
  if (failure) return { error: await tailErrorMessage(failure) }

  revalidatePath('/teacher/availability')
  return null
}
