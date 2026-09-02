'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getPortalSession } from '@/lib/portal/session'
import { isPortalFeatureEnabled } from '@/lib/portal/features'
import { sendPortalMessage } from '@/lib/portal/messages'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createNotification, getOwnerAndAdminProfileIds, getTeacherProfileId } from '@/lib/notifications'
import { getT } from '@/lib/i18n/serverTranslator'

export type SendMessageResult = { error: string | null }

export async function sendMessageAction(
  orgId: string,
  studentId: string,
  _prev: SendMessageResult,
  formData: FormData
): Promise<SendMessageResult> {
  const t = await getTranslations('portal.messages')

  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) {
    return { error: t('errors.unauthorized') }
  }
  if (!(await isPortalFeatureEnabled(orgId, 'messages'))) {
    return { error: t('errors.unauthorized') }
  }

  const body =(formData.get('body') as string | null)?.trim()
  if (!body || body.length === 0) return { error: t('errors.empty') }
  if (body.length > 2000) return { error: t('errors.tooLong', { max: 2000 }) }

  // Verify parent owns this student
  const db = createServiceRoleClient()
  const { data: rel } = await db
    .from('relationships')
    .select('id')
    .eq('parent_id', session.parentId)
    .eq('student_id', studentId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!rel) return { error: t('errors.unauthorized') }

  try {
    await sendPortalMessage({
      orgId,
      studentId,
      senderParentId: session.parentId,
      body,
    })
  } catch {
    return { error: t('errors.sendFailed') }
  }

  // Fire-and-forget: notify teacher + owner/admin
  const { data: student } = await db
    .from('students')
    .select('teacher_id')
    .eq('id', studentId)
    .single()

  const { data: parent } = await db
    .from('parents')
    .select('full_name')
    .eq('id', session.parentId)
    .single()

  const parentName = (parent as { full_name: string } | null)?.full_name ?? ''
  const ownerAdminIds = await getOwnerAndAdminProfileIds(orgId)
  const teacherProfileId = student?.teacher_id
    ? await getTeacherProfileId(student.teacher_id as string)
    : null

  const recipientIds = [...ownerAdminIds]
  if (teacherProfileId) recipientIds.push(teacherProfileId)
  const uniqueIds = [...new Set(recipientIds)]

  const tn = await getT('notifications')

  for (const profileId of uniqueIds) {
    createNotification({
      orgId,
      recipientProfileId: profileId,
      type: 'portal_message',
      title: tn('newMessage', { name: parentName }),
      body: body.length > 100 ? body.slice(0, 100) + '…' : body,
      actionUrl: `/messages/${studentId}`,
    })
  }

  revalidatePath(`/portal/${orgId}/messages/${studentId}`)
  // The list carries the preview and the unread badge for this thread; without
  // this it keeps showing the previous message until the poll happens to fire.
  revalidatePath(`/portal/${orgId}/messages`)
  return { error: null }
}
