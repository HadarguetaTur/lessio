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
