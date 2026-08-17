'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSession } from '@/lib/auth/session'
import { commonError, zodError } from '@/lib/i18n/actionErrors'

type ActionState = { error: string } | null

const groupSchema = z.object({
  name: z.string().min(1, 'validation.groupNameRequired').max(100),
  status: z.enum(['active', 'paused']).default('active'),
  student_ids: z.array(z.string().uuid()).min(1, 'validation.pickAtLeastOneStudent'),
})

async function requireOwnerOrAdmin() {
  const session = await getSession()
  if (session.role !== 'owner' && session.role !== 'admin') {
    throw new Error(await commonError('noPermission'))
  }
  return session
}

/** Parse student_ids from FormData — supports repeated `student_ids` fields */
function parseStudentIds(formData: FormData): string[] {
  return formData.getAll('student_ids').map(String).filter(Boolean)
}

export async function createGroup(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
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
  const db = createServiceRoleClient()

  const { data: group, error: groupError } = await db
    .from('student_groups')
    .insert({ organization_id: session.orgId, name, status })
    .select('id')
    .single()

  if (groupError || !group) return { error: 'שגיאה ביצירת הקבוצה' }

  const members = student_ids.map((sid) => ({ group_id: group.id, student_id: sid }))
  const { error: membersError } = await db.from('student_group_members').insert(members)

  if (membersError) {
    await db.from('student_groups').delete().eq('id', group.id)
    return { error: 'שגיאה בשיוך התלמידים' }
  }

  revalidatePath('/students')
  return null
}

export async function updateGroup(
  id: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireOwnerOrAdmin()
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
  const db = createServiceRoleClient()

  const { error: updateError } = await db
    .from('student_groups')
    .update({ name, status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) return { error: 'שגיאה בעדכון הקבוצה' }

  // Replace members: delete existing, insert new
  await db.from('student_group_members').delete().eq('group_id', id)

  const members = student_ids.map((sid) => ({ group_id: id, student_id: sid }))
  const { error: membersError } = await db.from('student_group_members').insert(members)

  if (membersError) return { error: 'שגיאה בעדכון חברי הקבוצה' }

  revalidatePath('/students')
  return null
}

export async function deleteGroup(id: string): Promise<ActionState> {
  try {
    await requireOwnerOrAdmin()
  } catch {
    return { error: await commonError('noPermission') }
  }

  const db = createServiceRoleClient()
  const { error } = await db.from('student_groups').delete().eq('id', id)

  if (error) return { error: 'שגיאה במחיקת הקבוצה' }

  revalidatePath('/students')
  return null
}

export async function toggleGroupStatus(
  id: string,
  currentStatus: 'active' | 'paused'
): Promise<ActionState> {
  try {
    await requireOwnerOrAdmin()
  } catch {
    return { error: await commonError('noPermission') }
  }

  const newStatus = currentStatus === 'active' ? 'paused' : 'active'
  const db = createServiceRoleClient()

  const { error } = await db
    .from('student_groups')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: 'שגיאה בשינוי סטטוס הקבוצה' }

  revalidatePath('/students')
  return null
}
