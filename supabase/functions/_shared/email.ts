/**
 * Deno-compatible email sender using Resend HTTP API.
 * Sprint 25 Story 3d.
 *
 * Edge Functions cannot use the Resend Node SDK.
 * This module calls the Resend REST API directly via fetch().
 */

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  from?: string
}

/**
 * Send an email via Resend HTTP API. Fire-and-forget — logs errors, never throws.
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = params.from ?? Deno.env.get('RESEND_FROM_EMAIL') ?? 'support@getlessio.com'

  if (!apiKey) {
    console.warn('[email/deno] RESEND_API_KEY not set — skipping email send')
    return
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error('[email/deno] Resend API error', {
        status: response.status,
        body,
        to: params.to,
      })
      return
    }

    console.info('[email/deno] Email sent', { to: params.to, subject: params.subject })
  } catch (err) {
    console.error('[email/deno] Failed to send email', { to: params.to, err })
  }
}
