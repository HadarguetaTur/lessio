'use server'

/**
 * Server actions for homework assignment detail.
 * Per /docs/sprint-24-scope.md § Story 1.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSession, requireMutation } from '@/lib/auth/session'
import { gradeSubmission } from '@/lib/homework/submissions'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { decryptToken } from '@/lib/crypto'

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
    return { error: 'אין הרשאה' }
  }

  try {
    requireMutation(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'מצב תמיכה הוא קריאה בלבד.' }
  }

  const parsed = GradeSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
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
    .select('parents ( phone )')
    .eq('student_id', studentId)
    .eq('organization_id', orgId)
    .eq('is_primary', true)
    .maybeSingle()

  type RelRow = { parents: { phone: string } | null }
  const phone = (rel as unknown as RelRow | null)?.parents?.phone
  if (!phone) return

  // Get org WhatsApp config
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
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

  const feedbackLine = feedback.trim() ? `משוב: ${feedback}` : ''

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
  })
}
