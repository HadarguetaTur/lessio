import { createLessonCharge, type ChargeAlert } from '@/lib/billing/createCharge'
import { autoSendPaymentRequest } from '@/lib/payment-request/autoSend'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const AUTO_COMPLETION_GRACE_MINUTES = 15
export const AUTO_COMPLETION_BATCH_SIZE = 100

export type CompleteLessonResult = { claimed: boolean; chargeAlert: ChargeAlert | null }

/** Completes a lesson and runs the same billing flow used by manual completion. */
export async function completeLesson(params: {
  lessonId: string
  organizationId: string
  source: 'manual' | 'automatic'
  alreadyCompleted?: boolean
}): Promise<CompleteLessonResult> {
  const { lessonId, organizationId, source, alreadyCompleted = false } = params
  const db = createServiceRoleClient()

  if (!alreadyCompleted) {
    let update = db
      .from('lessons')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_source: source,
        completion_error: null,
        cancel_reason: null,
      })
      .eq('id', lessonId)
      .eq('organization_id', organizationId)

    update = source === 'automatic'
      ? update.eq('status', 'scheduled')
      : update.neq('status', 'cancelled')

    const { data, error } = await update.select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) return { claimed: false, chargeAlert: null }
  }

  const alert = await createLessonCharge(lessonId, organizationId)
  await db
    .from('lessons')
    .update({ completion_error: alert?.message ?? null })
    .eq('id', lessonId)
    .eq('organization_id', organizationId)

  if (!alert) await autoSendPaymentRequest(lessonId, organizationId)
  return { claimed: true, chargeAlert: alert }
}

export type AutoCompletionSummary = {
  scanned: number
  completed: number
  retried: number
  warnings: number
  errors: number
}

/** Processes lessons whose end time plus the grace period has passed. */
export async function completeDueLessons(now = new Date()): Promise<AutoCompletionSummary> {
  const db = createServiceRoleClient()
  const cutoff = new Date(now.getTime() - AUTO_COMPLETION_GRACE_MINUTES * 60_000).toISOString()
  const [{ data: due, error: dueError }, { data: retries, error: retryError }] = await Promise.all([
    db.from('lessons').select('id, organization_id').eq('status', 'scheduled')
      .lte('end_at', cutoff).order('end_at', { ascending: true }).limit(AUTO_COMPLETION_BATCH_SIZE),
    db.from('lessons').select('id, organization_id').eq('status', 'completed')
      .eq('completion_source', 'automatic').not('completion_error', 'is', null)
      .order('completed_at', { ascending: true }).limit(AUTO_COMPLETION_BATCH_SIZE),
  ])
  if (dueError) throw new Error(dueError.message)
  if (retryError) throw new Error(retryError.message)

  const summary: AutoCompletionSummary = {
    scanned: (due?.length ?? 0) + (retries?.length ?? 0), completed: 0,
    retried: 0, warnings: 0, errors: 0,
  }

  for (const lesson of due ?? []) {
    try {
      const result = await completeLesson({ lessonId: lesson.id, organizationId: lesson.organization_id, source: 'automatic' })
      if (result.claimed) summary.completed++
      if (result.chargeAlert) summary.warnings++
    } catch (error) {
      summary.errors++
      console.error('[automatic-lesson-completion] lesson failed', { lessonId: lesson.id, error })
    }
  }

  for (const lesson of retries ?? []) {
    try {
      const result = await completeLesson({
        lessonId: lesson.id, organizationId: lesson.organization_id,
        source: 'automatic', alreadyCompleted: true,
      })
      summary.retried++
      if (result.chargeAlert) summary.warnings++
    } catch (error) {
      summary.errors++
      console.error('[automatic-lesson-completion] retry failed', { lessonId: lesson.id, error })
    }
  }
  return summary
}
