'use server'

/**
 * Server actions for homework assignment detail.
 * Per /docs/sprint-24-scope.md § Story 1.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { requireFeature } from '@/lib/saas/featureGate'
import { gradeSubmission } from '@/lib/homework/submissions'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { decryptToken } from '@/lib/crypto'
import { sendEmail, shouldSendEmail } from '@/lib/email'
import { homeworkGradedEmail } from '@/lib/email/templates/homeworkGraded'
import { commonError, zodError } from '@/lib/i18n/actionErrors'

export type GradeActionState = { error: string | null; success?: boolean }

const GradeSchema = z.object({
  submissionId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  score: z.coerce.number().int().min(0).max(100),
  feedback: z.string().max(1000).default(''),
})

export async function gradeSubmissionAction(
  _prev: GradeActionState,
  formData: FormData
): Promise<GradeActionState> {
  const session = await getSession()

  if (session.role !== 'owner' && session.role !== 'admin' && session.role !== 'teacher') {
    return { error: await commonError('noPermission') }
  }

  try {
    requireMutation(session)
  } catch (e) {
    return { error: await commonError('supportModeReadOnly') }
  }

  await requireFeature(session.orgId, 'homework')

  const parsed = GradeSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: await zodError(parsed.error.issues[0]) }
  }

  const { submissionId, assignmentId, score, feedback } = parsed.data

  const submission = await gradeSubmission({
    orgId: session.orgId,
    submissionId,
    score,
    feedback,
    gradedBy: session.profileId,
  })

  // Fire-and-forget: notify parent via WhatsApp
  notifyGraded(session.orgId, assignmentId, submission.studentId, score, feedback).catch((err) => {
    console.error('[homework/grade] WhatsApp notification failed', {
      orgId: session.orgId,
      submissionId,
      err,
    })
  })

  // Fire-and-forget: notify parent via email
  notifyGradedEmail(session.orgId, assignmentId, submission.studentId, score, feedback).catch((err) => {
    console.error('[homework/grade] email notification failed', {
      orgId: session.orgId,
      submissionId,
      err,
    })
  })

  revalidatePath(`/homework/${assignmentId}`)
  return { error: null, success: true }
}

async function notifyGraded(
  orgId: string,
  assignmentId: string,
  studentId: string,
  score: number,
  feedback: string
): Promise<void> {
  const db = createServiceRoleClient()

  // Get assignment title
  const { data: assignment } = await db
    .from('homework_assignments')
    .select('title')
    .eq('id', assignmentId)
    .single()

  if (!assignment) return

  // Resolve parent phone via student → primary relationship
  const { data: rel } = await db
    .from('relationships')
    .select('parents ( phone, preferred_locale )')
    .eq('student_id', studentId)
    .eq('organization_id', orgId)
    .eq('is_primary', true)
    .maybeSingle()

  type RelRow = { parents: { phone: string; preferred_locale: string | null } | null }
  const parentRow = (rel as unknown as RelRow | null)?.parents
  const phone = parentRow?.phone
  if (!phone) return

  // Get org WhatsApp config
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token, default_locale')
    .eq('id', orgId)
    .single()

  if (!org?.whatsapp_access_token || !org?.whatsapp_phone_number_id) {
    console.warn('[homework/grade] No WhatsApp config for org — skipping notification', { orgId })
    return
  }

  let accessToken: string
  try {
    accessToken = decryptToken(org.whatsapp_access_token as string)
  } catch (err) {
    console.error('[homework/grade] Failed to decrypt WhatsApp token', { orgId, err })
    return
  }

  const locale = resolveRecipientLocale({
    stored: parentRow?.preferred_locale,
    orgDefault: org.default_locale as string | null,
  })
  const feedbackLabel = (await getT('common', locale))('feedback')
  const feedbackLine = feedback.trim() ? `${feedbackLabel}: ${feedback}` : ''

  await sendSmartMessage({
    orgId,
    phone,
    accessToken,
    phoneNumberId: org.whatsapp_phone_number_id as string,
    templateType: 'homework_graded',
    vars: {
      title: (assignment as { title: string }).title,
      score: String(score),
      feedback_line: feedbackLine,
    },
    locale,
  })
}

async function notifyGradedEmail(
  orgId: string,
  assignmentId: string,
  studentId: string,
  score: number,
  feedback: string
): Promise<void> {
  const db = createServiceRoleClient()

  // Get assignment title
  const { data: assignment } = await db
    .from('homework_assignments')
    .select('title')
    .eq('id', assignmentId)
    .single()

  if (!assignment) return

  // Resolve parent email via student → primary relationship
  const { data: rel } = await db
    .from('relationships')
    .select('parents ( email )')
    .eq('student_id', studentId)
    .eq('organization_id', orgId)
    .eq('is_primary', true)
    .maybeSingle()

  type RelRow = { parents: { email: string | null } | null }
  const parentEmail = (rel as unknown as RelRow | null)?.parents?.email
  if (!parentEmail) return

  const canSend = await shouldSendEmail(orgId, 'homework_graded', parentEmail)
  if (!canSend) return

  const title = (assignment as { title: string }).title
  const { subject, html } = homeworkGradedEmail({
    title,
    score: String(score),
    feedback: feedback.trim() || undefined,
  })

  await sendEmail({ orgId, to: parentEmail, subject, html })
}
