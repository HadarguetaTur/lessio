'use server'

import { getPortalSession } from '@/lib/portal/session'
import { executeCancellation } from '@/lib/cancellation-flow/executeCancellation'
import { notifyMultiple, getOwnerAndAdminProfileIds, getTeacherProfileId } from '@/lib/notifications'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type CancelLessonResult =
  | { ok: true; charged: boolean; amount: number; message: string }
  | { ok: false; error: string }

export async function cancelLessonAction(
  orgId: string,
  lessonId: string
): Promise<CancelLessonResult> {
  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) {
    return { ok: false, error: 'unauthorized' }
  }

  const outcome = await executeCancellation(lessonId, session.parentId, orgId)

  if (!outcome.success) {
    const messages: Record<string, string> = {
      already_cancelled: 'השיעור כבר בוטל',
      not_eligible: 'לא ניתן לבטל שיעור זה',
      not_found: 'השיעור לא נמצא',
    }
    return { ok: false, error: messages[outcome.error] ?? 'שגיאה בביטול' }
  }

  // Fire-and-forget: notify teacher + owner/admin
  const db = createServiceRoleClient()
  const { data: lesson } = await db
    .from('lessons')
    .select('teacher_id')
    .eq('id', lessonId)
    .single()

  if (lesson?.teacher_id) {
    const [teacherProfileId, ownerAdminIds] = await Promise.all([
      getTeacherProfileId(lesson.teacher_id),
      getOwnerAndAdminProfileIds(orgId),
    ])
    const recipientIds = [...ownerAdminIds]
    if (teacherProfileId) recipientIds.push(teacherProfileId)
    const uniqueIds = [...new Set(recipientIds)]

    notifyMultiple(
      orgId,
      uniqueIds,
      'lesson_cancelled',
      `שיעור בוטל — ${outcome.studentName}`,
      `${outcome.teacherName} · ${new Date(outcome.lessonStartAt).toLocaleDateString('he-IL')}`,
      `/lessons/${lessonId}`
    )
  }

  const charged = outcome.chargeResult.shouldCharge && outcome.chargeResult.amount > 0
  return {
    ok: true,
    charged,
    amount: charged ? outcome.chargeResult.amount : 0,
    message: charged
      ? `השיעור בוטל. חיוב ביטול: ₪${outcome.chargeResult.amount.toFixed(2)}`
      : 'השיעור בוטל בהצלחה',
  }
}
