'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { sendPortalMessage } from '@/lib/portal/messages'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { mutationBlockedError } from '@/lib/i18n/actionErrors'
import { getTeacherByProfileId } from '@/lib/teachers'
import { canTeacherAccessStudent } from '@/lib/students'
import { getTranslations } from 'next-intl/server'

export type ReplyResult = { error: string | null }

export async function replyToPortalMessageAction(
  studentId: string,
  _prev: ReplyResult,
  formData: FormData
): Promise<ReplyResult> {
  const t = await getTranslations()
  const session = await getSession()

  try {
    requireMutation(session)
  } catch (err) {
    return { error: await mutationBlockedError(err) }
  }

  // Teachers reach portal threads through the inbox now, scoped to their own
  // students. The student id is client input, so the scope is re-checked here.
  if (session.role === 'teacher') {
    const teacher = await getTeacherByProfileId(session.profileId, session.orgId, { activeOnly: true })
    if (!teacher || !(await canTeacherAccessStudent(session.orgId, teacher.id, studentId))) {
      return { error: t('lessons.messageErrors.studentNotFound') }
    }
  }

  const body = (formData.get('body') as string | null)?.trim()
  if (!body || body.length === 0) return { error: t('lessons.messageErrors.empty') }
  if (body.length > 2000) return { error: t('lessons.messageErrors.tooLong') }

  // Verify student belongs to this org
  const db = createServiceRoleClient()
  const { data: student } = await db
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('organization_id', session.orgId)
    .maybeSingle()

  if (!student) return { error: t('lessons.messageErrors.studentNotFound') }

  try {
    await sendPortalMessage({
      orgId: session.orgId,
      studentId,
      senderProfileId: session.profileId,
      body,
    })
  } catch {
    return { error: t('lessons.messageErrors.sendFailed') }
  }

  // Mark parent messages as read
  const { error: readErr } = await db
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', session.orgId)
    .eq('student_id', studentId)
    .not('sender_parent_id', 'is', null)
    .is('read_at', null)

  if (readErr) {
    console.error('[messages] Failed to mark as read', { error: readErr.message })
  }

  revalidatePath(`/messages/${studentId}`)
  revalidatePath('/messages')
  return { error: null }
}
