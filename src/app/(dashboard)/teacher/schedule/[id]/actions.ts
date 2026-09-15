'use server'

import { revalidatePath } from 'next/cache'
import { getSession, requireMutation } from '@/lib/auth/session'
import { getLessonById, getLessonTitle, updateLessonStatus, LessonStatus } from '@/lib/lessons'
import { getTeacherByProfileId } from '@/lib/teachers'
import { createLessonCharge } from '@/lib/billing/createCharge'
import { getTranslations } from 'next-intl/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireFeature } from '@/lib/saas/featureGate'
import { classifyBroadcastText } from '@/lib/whatsapp/broadcast/classify'
import { startCampaign } from '@/lib/whatsapp/broadcast/send'
import { PARAM_LIMITS } from '@/lib/whatsapp/approvedTemplates'

const ALLOWED_STATUSES: LessonStatus[] = ['completed', 'no_show']

/**
 * A teacher telling this lesson's parents something about it.
 *
 * The narrowest possible slice of the broadcast engine: the category is locked
 * to a service update, the audience is this lesson's own parents, there is no
 * scheduling, and the lesson must be the teacher's own. A teacher cannot reach
 * the whole school and cannot send marketing at all — those stay with the owner.
 */
export async function sendLessonUpdateAction(
  lessonId: string,
  _prev: { error: string | null; sent?: number },
  formData: FormData
): Promise<{ error: string | null; sent?: number }> {
  const session = await getSession()
  requireMutation(session)
  if (session.role !== 'teacher') return { error: 'noPermission' }
  await requireFeature(session.orgId, 'broadcasts')

  const message = String(formData.get('message') ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!message) return { error: 'empty' }
  if (message.length > PARAM_LIMITS.broadcast_message) return { error: 'tooLong' }

  const teacher = await getTeacherByProfileId(session.profileId, session.orgId, { activeOnly: true })
  if (!teacher) return { error: 'noPermission' }

  const lesson = await getLessonById(lessonId, session.orgId)
  // Checked server-side rather than trusting the id in the URL: a lesson id is
  // guessable, and this action can message a stranger's parents.
  if (!lesson || lesson.teacher.id !== teacher.id) return { error: 'noPermission' }

  // {{2}} of the update body: the group or student this lesson is for, which
  // is what a parent recognises. getLessonTitle owns that rule already.
  const t = await getTranslations('lessons')
  const topic = getLessonTitle(lesson, t)

  const db = createServiceRoleClient()
  const { data: created, error } = await db
    .from('broadcast_campaigns')
    .insert({
      organization_id: session.orgId,
      name: topic,
      template_type: 'class_update',
      topic,
      message,
      audience: { kind: 'lesson', lessonId },
      status: 'draft',
      created_by_profile_id: session.profileId,
      created_by_role: 'teacher',
      lesson_id: lessonId,
    })
    .select('id')
    .single()

  if (error || !created) {
    console.error('[teacher/lesson-update] create failed', { lessonId, error: error?.message })
    return { error: 'failed' }
  }

  // `topic` is body parameter {{2}} of the UTILITY class_update template and is
  // teacher free text, so it is classified alongside the message — the same
  // hole the owner-facing compose screen had.
  const classification = await classifyBroadcastText(
    session.orgId,
    [topic, message].filter(Boolean).join('\n')
  )
  const start = await startCampaign((created as { id: string }).id, {
    contentLooksPromotional: classification.promotional,
    subscriptionLapsed: session.isSaasReadOnly === true,
  })

  revalidatePath(`/teacher/schedule/${lessonId}`)
  if (!start.ok) return { error: start.reason }
  return { error: null, sent: start.recipients }
}

export type TeacherOutcomeResult = {
  error: string | null
  chargeAlert?: string
}

export async function updateTeacherLessonOutcome(
  lessonId: string,
  _prevState: TeacherOutcomeResult,
  formData: FormData
): Promise<TeacherOutcomeResult> {
  const t = await getTranslations()
  const session = await getSession()
  const { userId, orgId, role } = session
  requireMutation(session)

  if (role !== 'teacher') {
    return { error: t('teacherSelf.errors.noPermission') }
  }

  const teacher = await getTeacherByProfileId(userId, orgId, { activeOnly: true })
  if (!teacher) {
    return { error: t('teacherSelf.errors.noActiveTeacherRecord') }
  }

  const status = formData.get('status') as LessonStatus | null
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return { error: t('teacherSelf.errors.invalidStatus') }
  }

  const lesson = await getLessonById(lessonId, orgId)
  if (!lesson) {
    return { error: 'validation.lessonNotFound' }
  }

  // Enforce ownership — teacher may only update their own lessons
  if (lesson.teacher.id !== teacher.id) {
    return { error: t('teacherSelf.errors.cannotUpdateLesson') }
  }

  if (lesson.status === 'cancelled') {
    return { error: t('teacherSelf.errors.lessonCancelled') }
  }

  if (lesson.status === status) {
    return { error: null }
  }

  try {
    if (status === 'completed' && session.profileId) {
      await updateLessonStatus(lessonId, orgId, status, { profileId: session.profileId, source: 'teacher' })
    } else {
      await updateLessonStatus(lessonId, orgId, status)
    }
  } catch (e) {
    return { error: t('teacherSelf.errors.statusUpdateFailed') }
  }

  revalidatePath(`/teacher/schedule/${lessonId}`)
  revalidatePath('/teacher/schedule')

  // Preserve existing Sprint 3 charge flow — do not redefine billing rules
  if (status === 'completed') {
    const alert = await createLessonCharge(lessonId, orgId)
    if (alert) {
      return { error: null, chargeAlert: alert.message }
    }
  }

  return { error: null }
}
