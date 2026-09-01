'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requirePlatformSession } from '@/lib/superadmin/session'
import {
  ASSIGNABLE_ROLES,
  changeStaffRole,
  inviteStaff,
  setStaffActive,
} from '@/lib/superadmin/staff'
import type { PlatformRole } from '@/lib/superadmin/capabilities'

/**
 * Staff management for /admin/staff.
 * Per /docs/sprint-34-scope.md § B.
 *
 * Every action needs `staff.manage`, which only a superadmin holds — the role
 * that can grant roles is the one capability that stays undelegated.
 */

export type StaffActionState = { error?: string; ok?: boolean }

const roleEnum = z.enum(ASSIGNABLE_ROLES as [PlatformRole, ...PlatformRole[]])

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2),
  role: roleEnum,
})

export async function inviteStaffAction(
  _prev: StaffActionState | null,
  formData: FormData
): Promise<StaffActionState> {
  const session = await requirePlatformSession('staff.manage')

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    fullName: formData.get('fullName'),
    role: formData.get('role'),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await inviteStaff({ ...parsed.data, actorProfileId: session.profileId })
  if (!result.ok) return { error: result.error }

  revalidatePath('/admin/staff')
  return { ok: true }
}

const roleChangeSchema = z.object({
  profileId: z.string().uuid(),
  role: roleEnum,
})

export async function changeStaffRoleAction(
  _prev: StaffActionState | null,
  formData: FormData
): Promise<StaffActionState> {
  const session = await requirePlatformSession('staff.manage')

  const parsed = roleChangeSchema.safeParse({
    profileId: formData.get('profileId'),
    role: formData.get('role'),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await changeStaffRole({ ...parsed.data, actorProfileId: session.profileId })
  if (!result.ok) return { error: result.error }

  revalidatePath('/admin/staff')
  return { ok: true }
}

const activeSchema = z.object({
  profileId: z.string().uuid(),
  isActive: z.enum(['true', 'false']),
})

export async function setStaffActiveAction(
  _prev: StaffActionState | null,
  formData: FormData
): Promise<StaffActionState> {
  const session = await requirePlatformSession('staff.manage')

  const parsed = activeSchema.safeParse({
    profileId: formData.get('profileId'),
    isActive: formData.get('isActive'),
  })
  if (!parsed.success) return { error: 'INVALID_INPUT' }

  const result = await setStaffActive({
    profileId: parsed.data.profileId,
    isActive: parsed.data.isActive === 'true',
    actorProfileId: session.profileId,
  })
  if (!result.ok) return { error: result.error }

  revalidatePath('/admin/staff')
  return { ok: true }
}
