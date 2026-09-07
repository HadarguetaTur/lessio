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
import { getShareableBaseUrl } from '@/lib/url/appUrl'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send email'

function getCallbackUrl(): string {
  return `${getShareableBaseUrl()}/settings/email/callback`
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

export interface Rfc2822MessageOptions {
  from: string
  to: string
  subject: string
  html: string
  /** Plain-text alternative. Cold emails should always carry one. */
  text?: string
  /** RFC Message-ID, angle brackets included. Omitted when absent. */
  messageId?: string
  attachments?: { filename: string; content: string }[]
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?utf-8?B?${Buffer.from(value).toString('base64')}?=`
}

function base64Lines(input: string): string {
  // RFC 2045: encoded lines no longer than 76 characters.
  return Buffer.from(input).toString('base64').replace(/(.{76})/g, '$1\r\n')
}

/**
 * Builds a base64url-encoded RFC 2822 message for `users.messages.send`.
 *
 * Body layout: text/html alone when there is no text part; multipart/alternative
 * (text first, html second) when there is; either wrapped in multipart/mixed
 * when attachments follow. Exported for the outbound engine, which sends from
 * a delegated mailbox but wants the same wire format.
 */
export function buildRfc2822Message(opts: Rfc2822MessageOptions): string {
  const stamp = Date.now()
  const altBoundary = `alt_${stamp}`
  const mixedBoundary = `mixed_${stamp}`
  const hasAttachments = Boolean(opts.attachments && opts.attachments.length > 0)

  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
  ]
  if (opts.messageId) headers.push(`Message-ID: ${opts.messageId}`)

  const htmlHeaders = ['Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64']
  const htmlBody = base64Lines(opts.html)

  let bodyHeaders: string[]
  let bodyLines: string[]
  if (opts.text) {
    bodyHeaders = [`Content-Type: multipart/alternative; boundary="${altBoundary}"`]
    bodyLines = [
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(opts.text),
      `--${altBoundary}`,
      ...htmlHeaders,
      '',
      htmlBody,
      `--${altBoundary}--`,
    ]
  } else {
    bodyHeaders = htmlHeaders
    bodyLines = [htmlBody]
  }

  let message: string
  if (hasAttachments) {
    const parts = [`--${mixedBoundary}`, ...bodyHeaders, '', ...bodyLines]
    for (const att of opts.attachments!) {
      parts.push(
        `--${mixedBoundary}`,
        'Content-Type: application/octet-stream',
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${att.filename}"`,
        '',
        att.content
      )
    }
    parts.push(`--${mixedBoundary}--`)
    message = [...headers, `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`, '', ...parts].join('\r\n')
  } else {
    message = [...headers, ...bodyHeaders, '', ...bodyLines].join('\r\n')
  }

  return toBase64Url(message)
}

/** Gmail API wants base64url: no padding, + → -, / → _. */
export function toBase64Url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
