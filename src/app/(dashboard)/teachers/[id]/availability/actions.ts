'use server'

import { getSession, requireMutation } from '@/lib/auth/session'
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

type ActionState = { error: string } | null

export async function createAvailability(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  const failure = await createAvailabilityWindows(orgId, teacherId, formData)
  if (failure) return { error: await availabilityErrorMessage(failure) }

  revalidatePath(`/teachers/${teacherId}/availability`)
  return null
}

export async function updateAvailability(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  const failure = await updateAvailabilityWindow(orgId, teacherId, formData)
  if (failure) return { error: await availabilityErrorMessage(failure) }

  revalidatePath(`/teachers/${teacherId}/availability`)
  return null
}

export async function deleteAvailability(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  const failure = await deleteAvailabilityWindow(orgId, teacherId, formData)
  if (failure) return { error: await availabilityErrorMessage(failure) }

  revalidatePath(`/teachers/${teacherId}/availability`)
  return null
}

export async function saveTeacherBreakDuration(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }

  const failure = await setTeacherBreakMinutes(
    orgId,
    teacherId,
    formData.get('break_duration_minutes')
  )
  if (failure) return { error: await breakErrorMessage(failure) }

  revalidatePath(`/teachers/${teacherId}/availability`)
  return null
}

// ── Leftover-time prompts ────────────────────────────────────────────────────
// `teacherId` comes from the URL here, so it is passed down as the scope: a
// prompt id belonging to another teacher will not resolve against it.

/** owner/admin gate + the teacher this route is editing. */
async function assertManager(
  teacherId: string
): Promise<{ orgId: string; userId: string; teacherId: string } | { error: string }> {
  const session = await getSession()
  const { orgId, role, userId } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') {
    return { error: await commonError('noPermission') }
  }
  return { orgId, userId, teacherId }
}

export async function blockTeacherTail(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await assertManager(teacherId)
  if ('error' in who) return who

  const failure = await blockTailPrompt({
    orgId: who.orgId,
    promptId: String(formData.get('prompt_id') ?? ''),
    resolvedBy: who.userId,
    teacherId,
  })
  if (failure) return { error: await tailErrorMessage(failure) }

  revalidatePath(`/teachers/${teacherId}/availability`)
  return null
}

export async function extendTeacherTail(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await assertManager(teacherId)
  if ('error' in who) return who

  const failure = await extendTailPrompt({
    orgId: who.orgId,
    promptId: String(formData.get('prompt_id') ?? ''),
    newEndTime: String(formData.get('new_end_time') ?? ''),
    resolvedBy: who.userId,
    teacherId,
  })
  if (failure) return { error: await tailErrorMessage(failure) }

  revalidatePath(`/teachers/${teacherId}/availability`)
  return null
}

export async function dismissTeacherTail(
  teacherId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const who = await assertManager(teacherId)
  if ('error' in who) return who

  const failure = await dismissTailPrompt({
    orgId: who.orgId,
    promptId: String(formData.get('prompt_id') ?? ''),
    resolvedBy: who.userId,
    teacherId,
  })
  if (failure) return { error: await tailErrorMessage(failure) }

  revalidatePath(`/teachers/${teacherId}/availability`)
  return null
}
