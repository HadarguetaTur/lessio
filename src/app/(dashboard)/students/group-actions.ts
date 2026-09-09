'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSession, requireMutation } from '@/lib/auth/session'
import { idsBelongToOrg } from '@/lib/auth/orgScope'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

type ActionState = { error: string } | null

const groupSchema = z.object({
  name: z.string().min(1, 'validation.groupNameRequired').max(100),
  status: z.enum(['active', 'paused']).default('active'),
  student_ids: z.array(z.string().uuid()).min(1, 'validation.pickAtLeastOneStudent'),
})

/**
 * Owner/admin, and a session actually allowed to write.
 *
 * The role check alone let two other actors through: a superadmin in
 * read-only support mode (which reports role 'owner'), and an org whose
 * subscription has lapsed. requireMutation is what stops both, and every
 * other mutating action in the product already calls it.
 */
async function requireOwnerOrAdmin() {
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') {
    throw new Error(await commonError('noPermission'))
  }
  requireMutation(session)
  return session
}

/**
 * Re-authorizes the ids this request names before any service-role write.
 *
 * `groupId` and `studentIds` arrive from the browser and the queries below run
 * with RLS bypassed, so without this an owner of one org could point these
 * actions at another org's rows. Group membership feeds `price_per_student` in
 * the monthly billing engine, so a wiped roster does not merely vandalise a
 * list — it silently re-prices the victim's next bill.
 *
 * Returns an error string for the caller to surface, or null when the ids are
 * genuinely the session org's. Deliberately the same message as a role
 * failure: "that group is not yours" and "you may not do this" are the same
 * answer to a caller who should not have known the id in the first place.
 */
async function authorizeGroupIds(
  orgId: string,
  ids: { groupId?: string; studentIds?: readonly string[] }
): Promise<string | null> {
  if (ids.groupId !== undefined) {
    if (!(await idsBelongToOrg('student_groups', [ids.groupId], orgId))) {
      return await commonError('noPermission')
    }
  }
  if (ids.studentIds !== undefined) {
    if (!(await idsBelongToOrg('students', ids.studentIds, orgId))) {
      return await commonError('noPermission')
    }
  }
  return null
}

/** Parse student_ids from FormData — supports repeated `student_ids` fields */
function parseStudentIds(formData: FormData): string[] {
  return formData.getAll('student_ids').map(String).filter(Boolean)
}

export async function createGroup(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  let session: Awaited<ReturnType<typeof requireOwnerOrAdmin>>
  try {
    session = await requireOwnerOrAdmin()
  } catch {
    return { error: await commonError('noPermission') }
  }

  const raw = {
    name: (formData.get('name') as string ?? '').trim(),
    status: (formData.get('status') as string) || 'active',
    student_ids: parseStudentIds(formData),
  }

  const parsed = groupSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const { name, status, student_ids } = parsed.data

  // The group row pins organization_id below, but the member rows do not —
  // without this a roster could name another tenant's students and pull their
  // names into this org's group views and billing.
  const idErr = await authorizeGroupIds(session.orgId, { studentIds: student_ids })
  if (idErr) return { error: idErr }

  const db = createServiceRoleClient()

  const { data: group, error: groupError } = await db
    .from('student_groups')
    .insert({ organization_id: session.orgId, name, status })
    .select('id')
    .single()

  if (groupError || !group) return { error: t('students.groupErrors.createFailed') }

  const members = student_ids.map((sid) => ({ group_id: group.id, student_id: sid }))
  const { error: membersError } = await db.from('student_group_members').insert(members)

  if (membersError) {
    await db.from('student_groups').delete().eq('id', group.id)
    return { error: t('students.groupErrors.assignFailed') }
  }

  revalidatePath('/students')
  return null
}

export async function updateGroup(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  let session: Awaited<ReturnType<typeof requireOwnerOrAdmin>>
  try {
    session = await requireOwnerOrAdmin()
  } catch {
    return { error: await commonError('noPermission') }
  }

  const raw = {
    name: (formData.get('name') as string ?? '').trim(),
    status: (formData.get('status') as string) || 'active',
    student_ids: parseStudentIds(formData),
  }

  const parsed = groupSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const { name, status, student_ids } = parsed.data

  const idErr = await authorizeGroupIds(session.orgId, { groupId: id, studentIds: student_ids })
  if (idErr) return { error: idErr }

  const db = createServiceRoleClient()

  const { error: updateError } = await db
    .from('student_groups')
    .update({ name, status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', session.orgId)

  if (updateError) return { error: t('students.groupErrors.updateFailed') }

  // Replace members: delete existing, insert new. `id` is proven to be this
  // org's above, so the membership rows reached through it are too.
  await db.from('student_group_members').delete().eq('group_id', id)

  const members = student_ids.map((sid) => ({ group_id: id, student_id: sid }))
  const { error: membersError } = await db.from('student_group_members').insert(members)

  if (membersError) return { error: t('students.groupErrors.updateMembersFailed') }

  revalidatePath('/students')
  return null
}

export async function deleteGroup(id: string): Promise<ActionState> {
  const t = await getTranslations()
  let session: Awaited<ReturnType<typeof requireOwnerOrAdmin>>
  try {
    session = await requireOwnerOrAdmin()
  } catch {
    return { error: await commonError('noPermission') }
  }

  // student_group_members cascades on this delete, so an unscoped id here does
  // not just remove a row — it wipes another org's roster.
  const idErr = await authorizeGroupIds(session.orgId, { groupId: id })
  if (idErr) return { error: idErr }

  const db = createServiceRoleClient()
  const { error } = await db
    .from('student_groups')
    .delete()
    .eq('id', id)
    .eq('organization_id', session.orgId)

  if (error) return { error: t('students.groupErrors.deleteFailed') }

  revalidatePath('/students')
  return null
}

export async function toggleGroupStatus(
  id: string,
  currentStatus: 'active' | 'paused'
): Promise<ActionState> {
  const t = await getTranslations()
  let session: Awaited<ReturnType<typeof requireOwnerOrAdmin>>
  try {
    session = await requireOwnerOrAdmin()
  } catch {
    return { error: await commonError('noPermission') }
  }

  const idErr = await authorizeGroupIds(session.orgId, { groupId: id })
  if (idErr) return { error: idErr }

  const newStatus = currentStatus === 'active' ? 'paused' : 'active'
  const db = createServiceRoleClient()

  const { error } = await db
    .from('student_groups')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', session.orgId)

  if (error) return { error: t('students.groupErrors.toggleFailed') }

  revalidatePath('/students')
  return null
}
