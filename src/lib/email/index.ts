/**
 * Email delivery via Resend — Sprint 25 Story 3a.
 *
 * Fire-and-forget pattern: errors are logged, never thrown.
 * Same pattern as WhatsApp message sending.
 */

import { Resend } from 'resend'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

let _resend: Resend | null = null

function getResend(): Resend | null {
  if (_resend) return _resend
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  _resend = new Resend(apiKey)
  return _resend
}

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'noreply@lessio.app'
}

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  orgName?: string
  /** Base64-encoded file contents (Resend API) */
  attachments?: { filename: string; content: string }[]
}

/**
 * Send an email via Resend. Catches errors, logs, never throws.
 * @returns true if the message was accepted by Resend, false if skipped or failed
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.warn('[email] Resend not configured — skipping email send', { to: params.to })
    return false
  }

  const fromEmail = getFromEmail()
  const from = params.orgName ? `${params.orgName} <${fromEmail}>` : fromEmail

  try {
    await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments,
    })
    console.info('[email] Email sent', { to: params.to, subject: params.subject })
    return true
  } catch (err) {
    console.error('[email] Failed to send email', {
      to: params.to,
      subject: params.subject,
      err,
    })
    return false
  }
}

export type EmailNotificationType =
  | 'lesson_reminder'
  | 'payment_reminder'
  | 'homework_assignment'
  | 'receipt'
  | 'homework_graded'
  | 'progress_report'

/**
 * Check whether email should be sent for a given org + notification type.
 * Returns false if email is disabled for this type or parent has no email.
 */
export async function shouldSendEmail(
  orgId: string,
  type: EmailNotificationType,
  parentEmail: string | null | undefined
): Promise<boolean> {
  if (!parentEmail) return false
  if (!process.env.RESEND_API_KEY) return false

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('email_notifications')
    .eq('id', orgId)
    .single()

  if (!org) return false

  const settings = (org.email_notifications ?? {}) as Record<string, boolean>
  return settings[type] === true
}
