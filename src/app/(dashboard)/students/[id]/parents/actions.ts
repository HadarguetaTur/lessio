'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

type ActionState = { error: string } | null

/**
 * Confirms a client-supplied row id really belongs to the acting org, before it is
 * used as a foreign key. Relationship rows carry their own organization_id, so the
 * row lands in the right tenant either way — but the id it points at would not.
 */
async function belongsToOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'parents' | 'students',
  id: string,
  orgId: string
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  return data !== null
}

export async function linkParent(
  studentId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const t = await getTranslations()
  const parentId = formData.get('parent_id') as string
  const isPrimary = formData.get('is_primary') === 'on'

  if (!parentId) return { error: t('students.linkParentErrors.pickParent') }

  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return { error: await commonError('noPermission') }
  const supabase = await createClient()

  // parent_id and the student route param are both client-supplied. The row's own
  // organization_id is pinned above, but nothing stops it pointing at a parent or
  // student from another org — a link later traversed to send that family WhatsApp.
  if (!(await belongsToOrg(supabase, 'parents', parentId, orgId))) {
    return { error: t('students.linkParentErrors.pickParent') }
  }
  if (!(await belongsToOrg(supabase, 'students', studentId, orgId))) {
    return { error: await commonError('notFound') }
  }

  // If marking as primary, clear existing primary for this student first
  if (isPrimary) {
    await supabase
      .from('relationships')
      .update({ is_primary: false })
      .eq('student_id', studentId)
      .eq('organization_id', orgId)
  }

  const { error } = await supabase.from('relationships').insert({
    organization_id: orgId,
    parent_id: parentId,
    student_id: studentId,
    is_primary: isPrimary,
  })

  if (error) {
    if (error.code === '23505') return { error: t('students.linkParentErrors.alreadyLinked') }
    return { error: t('students.linkParentErrors.linkFailed') }
  }

  revalidatePath(`/students/${studentId}/parents`)
  return null
}

export async function setPrimary(relationshipId: string, studentId: string): Promise<void> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return
  const supabase = await createClient()

  // Unset all primaries for this student, then set the chosen one
  await supabase
    .from('relationships')
    .update({ is_primary: false })
    .eq('student_id', studentId)
    .eq('organization_id', orgId)

  await supabase
    .from('relationships')
    .update({ is_primary: true })
    .eq('id', relationshipId)
    .eq('organization_id', orgId)

  revalidatePath(`/students/${studentId}/parents`)
}

export async function unlinkParent(relationshipId: string, studentId: string): Promise<void> {
  const session = await getSession()
  const { orgId, role } = session
  requireMutation(session)
  if (role !== 'owner' && role !== 'admin') return
  const supabase = await createClient()

  await supabase
    .from('relationships')
    .delete()
    .eq('id', relationshipId)
    .eq('organization_id', orgId)

  revalidatePath(`/students/${studentId}/parents`)
}
