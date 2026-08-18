'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession, requireMutation } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { commonError, zodError } from '@/lib/i18n/actionErrors'
import { getTranslations } from 'next-intl/server'

type ActionState = { error: string } | null

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
