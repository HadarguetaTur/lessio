/**
 * Gmail OAuth2 + send helpers — Sprint 28.
 *
 * Flow:
 *   1. buildGmailAuthUrl(state)  → redirect user to Google consent
 *   2. exchangeGmailCode(code)   → get access_token + refresh_token + email
 *   3. sendViaGmail(...)         → send via googleapis SDK (handles token refresh)
 *
 * Refresh tokens are stored encrypted via encryptGmailToken / decryptGmailToken.
 */

import { google } from 'googleapis'
import { decryptGmailToken } from '@/lib/crypto'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send email'

function getCallbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/settings/email/callback`
}

// ── OAuth URL ────────────────────────────────────────────────────────────────

export function buildGmailAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('[gmail] GOOGLE_CLIENT_ID is not set')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(),
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// ── Code exchange ────────────────────────────────────────────────────────────

export interface GmailTokens {
  accessToken: string
  refreshToken: string
  email: string
}

export async function exchangeGmailCode(code: string): Promise<GmailTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('[gmail] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set')
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getCallbackUrl(),
      grant_type: 'authorization_code',
      code,
    }).toString(),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '')
    throw new Error(`[gmail] Token exchange failed ${tokenRes.status}: ${body}`)
  }

  const tokenJson = await tokenRes.json() as {
    access_token?: string
    refresh_token?: string
    error?: string
  }

  if (!tokenJson.access_token || !tokenJson.refresh_token) {
    throw new Error(`[gmail] Token exchange: missing tokens — ${JSON.stringify(tokenJson)}`)
  }

  // Fetch the email address associated with this token
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })

  if (!userRes.ok) {
    throw new Error(`[gmail] Userinfo fetch failed ${userRes.status}`)
  }

  const userJson = await userRes.json() as { email?: string }

  if (!userJson.email) {
    throw new Error('[gmail] Userinfo response missing email')
  }

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
    email: userJson.email,
  }
}

// ── Send ─────────────────────────────────────────────────────────────────────

export interface GmailSendParams {
  encryptedRefreshToken: string
  fromEmail: string
  fromName: string | undefined
  to: string
  subject: string
  html: string
  attachments?: { filename: string; content: string }[]
}

/**
 * Sends an email via Gmail API using a stored (encrypted) refresh token.
 * Uses the googleapis SDK which handles OAuth token management automatically.
 * Returns true on success, false on failure (logs error, never throws).
 */
export async function sendViaGmail(params: GmailSendParams): Promise<boolean> {
  let refreshToken: string
  try {
    refreshToken = decryptGmailToken(params.encryptedRefreshToken)
  } catch (err) {
    console.error('[gmail] Failed to decrypt refresh token', { err })
    return false
  }

  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    )
    auth.setCredentials({ refresh_token: refreshToken })

    const gmail = google.gmail({ version: 'v1', auth })

    const from = params.fromName
      ? `${params.fromName} <${params.fromEmail}>`
      : params.fromEmail

    const raw = buildRfc2822Message({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments,
    })

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })

    console.info('[gmail] Email sent', { to: params.to, subject: params.subject })
    return true
  } catch (err) {
    console.error('[gmail] Failed to send email', { to: params.to, err })
    return false
  }
}

// ── RFC 2822 builder ─────────────────────────────────────────────────────────

function buildRfc2822Message(opts: {
  from: string
  to: string
  subject: string
  html: string
  attachments?: { filename: string; content: string }[]
}): string {
  const boundary = `boundary_${Date.now()}`
  const hasAttachments = opts.attachments && opts.attachments.length > 0

  const subjectEncoded = `=?utf-8?B?${Buffer.from(opts.subject).toString('base64')}?=`

  let message: string

  if (hasAttachments) {
    const parts = [
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(opts.html).toString('base64'),
    ]

    for (const att of opts.attachments!) {
      parts.push(
        `--${boundary}`,
        `Content-Type: application/octet-stream`,
        `Content-Transfer-Encoding: base64`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        '',
        att.content,
      )
    }

    parts.push(`--${boundary}--`)

    message = [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      ...parts,
    ].join('\r\n')
  } else {
    message = [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(opts.html).toString('base64'),
    ].join('\r\n')
  }

  // Gmail API requires base64url encoding (no padding, + → -, / → _)
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
