/**
 * Email delivery — Sprint 25 (Resend) + Sprint 28 (per-org Gmail).
 *
 * Priority: if the org has a connected Gmail account, send via Gmail API.
 * Fallback: platform-level Resend account (RESEND_API_KEY).
 *
 * Fire-and-forget pattern: errors are logged, never thrown.
 */

import { Resend } from 'resend'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendViaGmail } from '@/lib/gmail'

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
  orgId: string
  to: string
  subject: string
  html: string
  orgName?: string
  /** Base64-encoded file contents */
  attachments?: { filename: string; content: string }[]
}

/**
 * Send an email for an org. Uses the org's connected Gmail if available,
 * otherwise falls back to the platform Resend account.
 * Catches errors, logs, never throws.
 * @returns true if the message was accepted, false if skipped or failed
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('gmail_refresh_token, gmail_connected_email')
    .eq('id', params.orgId)
    .single()

  // Gmail path
  if (org?.gmail_refresh_token && org?.gmail_connected_email) {
    return sendViaGmail({
      encryptedRefreshToken: org.gmail_refresh_token,
      fromEmail: org.gmail_connected_email,
      fromName: params.orgName,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments,
    })
  }

  // Resend fallback
  const resend = getResend()
  if (!resend) {
    console.warn('[email] No email provider configured — skipping', { to: params.to })
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
    console.info('[email] Email sent via Resend', { to: params.to, subject: params.subject })
    return true
  } catch (err) {
    console.error('[email] Resend send failed', { to: params.to, subject: params.subject, err })
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
 * Returns false if the org has no email provider or the type is disabled.
 */
export async function shouldSendEmail(
  orgId: string,
  type: EmailNotificationType,
  parentEmail: string | null | undefined
): Promise<boolean> {
  if (!parentEmail) return false

  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('email_notifications, gmail_refresh_token')
    .eq('id', orgId)
    .single()

  if (!org) return false

  const hasGmail = Boolean(org.gmail_refresh_token)
  const hasResend = Boolean(process.env.RESEND_API_KEY)
  if (!hasGmail && !hasResend) return false

  const settings = (org.email_notifications ?? {}) as Record<string, boolean>
  return settings[type] === true
}
