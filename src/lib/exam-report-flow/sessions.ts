/**
 * WhatsApp exam-report session state — a student reports an exam over the bot.
 *
 * Modelled on src/lib/support/supportSessions.ts: one row per (org, phone),
 * an explicit step (four turns: subject → title → date → optional file),
 * expiry checked at read time, deleted by any higher-priority event.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

/** Ten minutes, matching the cancellation and support flows. */
const SESSION_TIMEOUT_MINUTES = 10

export type ExamReportStep =
  | 'awaiting_subject'
  | 'awaiting_title'
  | 'awaiting_date'
  | 'awaiting_file'

export interface ExamReportSession {
  id: string
  organization_id: string
  phone: string
  student_id: string
  step: ExamReportStep
  draft_subject: string | null
  draft_title: string | null
  draft_exam_date: string | null
  expires_at: string
}

/** Starts (or restarts) an exam report. A second tap replaces the first. */
export async function startExamReportSession(
  orgId: string,
  phone: string,
  studentId: string
): Promise<void> {
  const db = createServiceRoleClient()
  const expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()

  const { error } = await db.from('exam_report_sessions').upsert(
    {
      organization_id: orgId,
      phone,
      student_id: studentId,
      step: 'awaiting_subject',
      draft_subject: null,
      draft_title: null,
      draft_exam_date: null,
      expires_at: expiresAt,
    },
    { onConflict: 'organization_id,phone' }
  )

  if (error) {
    throw new Error(`[exam-report/sessions] Failed to start session: ${error.message}`)
  }
}

/**
 * Records the answer for the current step and advances. The expiry is extended
 * on every turn — the clock measures idle time, not total time.
 */
export async function advanceExamReportSession(
  orgId: string,
  phone: string,
  patch: Partial<Pick<ExamReportSession, 'draft_subject' | 'draft_title' | 'draft_exam_date'>> & {
    step: ExamReportStep
  }
): Promise<void> {
  const db = createServiceRoleClient()
  const expiresAt = new Date(Date.now() + SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()

  const { error } = await db
    .from('exam_report_sessions')
    .update({ ...patch, expires_at: expiresAt })
    .eq('organization_id', orgId)
    .eq('phone', phone)

  if (error) {
    throw new Error(`[exam-report/sessions] Failed to advance session: ${error.message}`)
  }
}

/** The active (non-expired) session for this phone, or null. */
export async function getActiveExamReportSession(
  orgId: string,
  phone: string
): Promise<ExamReportSession | null> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('exam_report_sessions')
    .select(
      'id, organization_id, phone, student_id, step, draft_subject, draft_title, draft_exam_date, expires_at'
    )
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !data) return null
  return data as ExamReportSession
}

/** Ends the session — on completion or any higher-priority event. */
export async function deleteExamReportSession(orgId: string, phone: string): Promise<void> {
  const db = createServiceRoleClient()
  await db.from('exam_report_sessions').delete().eq('organization_id', orgId).eq('phone', phone)
}
