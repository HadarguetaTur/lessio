'use server'

import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import { getPortalSession } from '@/lib/portal/session'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'
import { executeCancellation } from '@/lib/cancellation-flow/executeCancellation'
import { notifyMultiple, getOwnerAndAdminProfileIds, getTeacherProfileId } from '@/lib/notifications'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getT } from '@/lib/i18n/serverTranslator'

/**
 * `error` is a key under portal.schedule.errors; the dialog renders the
 * outcome, so the amount is returned raw rather than pre-formatted into a
 * Hebrew sentence.
 */
export type CancelLessonResult =
  | { ok: true; charged: boolean; amount: number }
  | { ok: false; error: 'unauthorized' | 'already_cancelled' | 'not_eligible' | 'not_found' | 'generic' }

export async function cancelLessonAction(
  orgId: string,
  lessonId: string
): Promise<CancelLessonResult> {
  const session = await getPortalSession()
  if (!session || session.orgId !== orgId) {
    return { ok: false, error: 'unauthorized' }
  }

  const outcome = await executeCancellation(lessonId, session.parentId, orgId, 'portal')

  if (!outcome.success) {
    const known = ['already_cancelled', 'not_eligible', 'not_found'] as const
    const error = (known as readonly string[]).includes(outcome.error)
      ? (outcome.error as (typeof known)[number])
      : 'generic'
    return { ok: false, error }
  }

  // The lesson has moved and a charge may have appeared. Without this the
  // parent is left looking at a schedule that still lists the lesson as
  // scheduled, with a live cancel button on it.
  revalidatePath(`/portal/${orgId}/schedule`)
  revalidatePath(`/portal/${orgId}/home`)
  revalidatePath(`/portal/${orgId}/payments`)

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

    const [tn, locale] = await Promise.all([getT('notifications'), getLocale()])
    const intlLocale = toIntlLocale(parseAppLocale(locale))

    notifyMultiple(
      orgId,
      uniqueIds,
      'lesson_cancelled',
      tn('lessonCancelled', { name: outcome.studentName }),
      `${outcome.teacherName} · ${new Date(outcome.lessonStartAt).toLocaleDateString(intlLocale)}`,
      `/lessons/${lessonId}`
    )
  }

  const charged = outcome.chargeResult.shouldCharge && outcome.chargeResult.amount > 0
  return {
    ok: true,
    charged,
    amount: charged ? outcome.chargeResult.amount : 0,
  }
}
