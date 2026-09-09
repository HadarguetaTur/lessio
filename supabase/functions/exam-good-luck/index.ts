/**
 * exam-good-luck — Supabase Edge Function
 *
 * Trigger: scheduled cron, every hour (0 * * * *)
 *
 * Wishes a student luck on the day of an exam. Algorithm (per org):
 *   1. Find exams whose exam_date is today in the org's timezone
 *   2. Decide per exam whether this hour is the one to send (isGoodLuckDue):
 *      the org's morning hour, or hoursBefore a known exam_time, never earlier
 *      than the morning hour and never once the exam has started
 *   3. Claim the notification_log row ('pending') — skip if another run owns it
 *   4. Resolve the target phone (student's own phone → primary parent)
 *   5. Send the WhatsApp message (session-window aware)
 *   6. Settle the notification_log row to sent/failed
 *
 * Only runs for orgs with reminders_enabled, an active service_state, the
 * exam good-luck automation on, and a connected WhatsApp number. Failures are
 * isolated per org/exam.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCronRequest, getSupabaseSecretKey } from '../_shared/supabaseSecret.ts'
import { decryptToken } from '../_shared/crypto.ts'
import { sendSmartMessage } from '../_shared/whatsapp.ts'
import { resolveTemplate, resolveRecipientLocale } from '../_shared/templates.ts'
import { botString } from '../_shared/botStrings.ts'
import { reportEdgeError, serveWithErrorReporting } from '../_shared/telemetry.ts'
import { claimNotification, settleNotification } from '../_shared/notificationClaim.ts'
import { isGoodLuckDue } from '../_shared/examGoodLuckTiming.ts'

serveWithErrorReporting('exam-good-luck', async (_req) => {
  const authError = authorizeCronRequest(_req)
  if (authError) return authError

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = getSupabaseSecretKey()
  // deno-lint-ignore no-explicit-any
  const db = createClient(supabaseUrl, serviceRoleKey) as any

  const { data: orgs, error: orgsError } = await db
    .from('organizations')
    .select(
      'id, timezone, exam_good_luck_hour, exam_good_luck_hours_before, whatsapp_phone_number_id, whatsapp_access_token, default_locale'
    )
    .eq('reminders_enabled', true)
    // Platform billing: a lapsed studio stops sending. See organizations.service_state.
    .eq('service_state', 'active')
    .eq('automation_exam_good_luck_enabled', true)
    .not('whatsapp_phone_number_id', 'is', null)
    .not('whatsapp_access_token', 'is', null)

  if (orgsError) {
    console.error('[exam-good-luck] Failed to fetch orgs', { error: orgsError.message })
    return new Response('error fetching orgs', { status: 500 })
  }

  if (!orgs || orgs.length === 0) {
    return new Response('no orgs to process', { status: 200 })
  }

  for (const org of orgs) {
    try {
      await processOrg(db, org)
    } catch (err) {
      console.error('[exam-good-luck] Unhandled error for org', {
        org_id: org.id,
        error: String(err),
      })
      await reportEdgeError(db, {
        thrown: err,
        route: 'exam-good-luck',
        organizationId: org.id,
      })
    }
  }

  return new Response('ok', { status: 200 })
})

/** YYYY-MM-DD in an IANA timezone (same pattern as homework-reminders). */
function ymdInTimezone(d: Date, timeZone: string): string {
  return d.toLocaleDateString('sv-SE', { timeZone })
}

/** Whole hour 0–23 in an IANA timezone. */
function hourInTimezone(d: Date, timeZone: string): number {
  const hour = d.toLocaleString('en-GB', { timeZone, hour: '2-digit', hour12: false })
  // 'en-GB' renders "24" for midnight in some ICU versions; normalise it.
  const parsed = Number(hour)
  return Number.isFinite(parsed) ? parsed % 24 : 0
}

// deno-lint-ignore no-explicit-any
async function processOrg(db: any, org: any): Promise<void> {
  const orgId: string = org.id
  const tz: string = org.timezone || 'UTC'
  const now = new Date()
  const today = ymdInTimezone(now, tz)
  const nowHour = hourInTimezone(now, tz)
  const morningHour: number = org.exam_good_luck_hour ?? 7
  const hoursBefore: number = org.exam_good_luck_hours_before ?? 2

  const { data: exams, error: examsError } = await db
    .from('student_exams')
    .select(`
      id,
      subject,
      title,
      exam_date,
      exam_time,
      students (
        full_name,
        phone,
        relationships (
          is_primary,
          parents ( phone, preferred_locale )
        )
      )
    `)
    .eq('organization_id', orgId)
    .eq('exam_date', today)

  if (examsError) {
    console.error('[exam-good-luck] Failed to fetch exams', {
      org_id: orgId,
      error: examsError.message,
    })
    return
  }

  if (!exams || exams.length === 0) return

  const due = exams.filter((exam: { exam_time: string | null }) =>
    isGoodLuckDue({
      nowHour,
      examTime: exam.exam_time ?? null,
      morningHour,
      hoursBefore,
    })
  )

  if (due.length === 0) return

  let accessToken: string
  try {
    accessToken = await decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[exam-good-luck] Token decryption failed', {
      org_id: orgId,
      error: String(err),
    })
    return
  }

  for (const exam of due) {
    // ── Claim before send — only the run that owns the row may send ───────────
    const claim = await claimNotification(db, {
      orgId,
      type: 'exam_good_luck',
      entityId: exam.id,
    })
    if (claim !== 'claimed') continue // already sent, in flight, or ledger unavailable

    const phone = resolvePhone(exam)
    if (!phone) {
      console.warn('[exam-good-luck] No phone for exam', { org_id: orgId, exam_id: exam.id })
      await settle(db, orgId, exam.id, 'failed', 'No phone found')
      continue
    }

    const locale = resolveRecipientLocale({
      stored: resolveParentLocale(exam),
      orgDefault: org.default_locale,
    })

    const studentName: string = exam.students?.full_name || botString('the_student', locale)
    const vars = {
      student_name: studentName,
      subject: exam.subject,
      title: exam.title,
    }

    const message = await resolveTemplate(db, orgId, 'exam_good_luck', vars, locale)

    let sendError: string | null = null
    try {
      await sendSmartMessage(
        db,
        orgId,
        phone,
        accessToken,
        org.whatsapp_phone_number_id,
        'exam_good_luck',
        message,
        [studentName, exam.subject, exam.title],
        locale,
        vars
      )
    } catch (err) {
      sendError = String(err)
      console.error('[exam-good-luck] WhatsApp send failed', {
        org_id: orgId,
        exam_id: exam.id,
        error: sendError,
      })
    }

    await settle(db, orgId, exam.id, sendError ? 'failed' : 'sent', sendError)
  }
}

/**
 * The message is for the student, so their own phone wins; an org that stores no
 * student phone reaches them through the primary parent. Same rule as
 * homework-reminders.
 */
// deno-lint-ignore no-explicit-any
function resolvePhone(exam: any): string | null {
  const student = exam.students
  if (!student) return null
  if (student.phone) return student.phone as string

  for (const rel of student.relationships ?? []) {
    if (rel.is_primary && rel.parents?.phone) return rel.parents.phone as string
  }
  return null
}

// deno-lint-ignore no-explicit-any
function resolveParentLocale(exam: any): string | null {
  for (const rel of exam.students?.relationships ?? []) {
    if (rel.is_primary && rel.parents?.preferred_locale) {
      return rel.parents.preferred_locale as string
    }
  }
  return null
}

/** Settles the row claimed at the top of the loop. */
// deno-lint-ignore no-explicit-any
function settle(
  db: any,
  orgId: string,
  examId: string,
  status: 'sent' | 'failed',
  errorMessage: string | null
): Promise<void> {
  return settleNotification(db, {
    orgId,
    type: 'exam_good_luck',
    entityId: examId,
    status,
    errorMessage,
  })
}
