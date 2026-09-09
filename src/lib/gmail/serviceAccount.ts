/**
 * Gmail through a service account with domain-wide delegation.
 *
 * The per-org OAuth flow in ./index.ts is for customers connecting their own
 * Gmail. This module is for the platform's own Workspace: a service account
 * the Workspace admin authorised once (Admin console → Security → API
 * controls → Domain-wide delegation) may act as any user on the domain, so
 * the outbound engine can send from — and read the inbox of — each outreach
 * mailbox with no consent screen, no OAuth verification and no expiring
 * refresh token. Setup: docs/outbound-gmail-setup.md.
 */

import { google, type gmail_v1 } from 'googleapis'
import { randomUUID } from 'node:crypto'
import { buildRfc2822Message } from './index'

export const SERVICE_ACCOUNT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
]

/** Domain used in generated Message-IDs; any value we control works. */
const MESSAGE_ID_DOMAIN = 'getlessio.com'

export function isServiceAccountConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SA_CLIENT_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY)
}

function readCredentials(): { email: string; key: string } {
  const email = process.env.GOOGLE_SA_CLIENT_EMAIL
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY
  if (!email || !rawKey) {
    throw new Error('[gmail/sa] GOOGLE_SA_CLIENT_EMAIL / GOOGLE_SA_PRIVATE_KEY are not set')
  }
  // Vercel stores the PEM with literal "\n" sequences; a .env file may too.
  return { email, key: rawKey.replace(/\\n/g, '\n') }
}

/** A Gmail client acting as `userEmail`. */
export function gmailAsUser(userEmail: string): gmail_v1.Gmail {
  const { email, key } = readCredentials()
  const auth = new google.auth.JWT({ email, key, scopes: SERVICE_ACCOUNT_SCOPES, subject: userEmail })
  return google.gmail({ version: 'v1', auth })
}

// ── Send ─────────────────────────────────────────────────────────────────────

export interface SendAsUserParams {
  from: string
  fromName?: string | null
  to: string
  subject: string
  html: string
  text?: string
  /** Reply inside an existing Gmail conversation. */
  threadId?: string | null
  /** RFC Message-ID of the message being answered. */
  inReplyTo?: string | null
  /** RFC Message-IDs of the conversation so far, oldest first. */
  references?: (string | null | undefined)[]
  /** List-Unsubscribe and friends. */
  headers?: Record<string, string>
}

export interface SendAsUserResult {
  /** Gmail's internal message id (not the RFC Message-ID). */
  id: string
  threadId: string | null
  /**
   * The Message-ID the message actually carries. Gmail rewrites ours, so this
   * is read back after the send — a follow-up that wants to thread must quote
   * the id the recipient's client will see, not the one we proposed.
   */
  rfcMessageId: string
}

export async function sendAsUser(params: SendAsUserParams): Promise<SendAsUserResult> {
  const gmail = gmailAsUser(params.from)
  const proposedMessageId = `<${randomUUID()}@${MESSAGE_ID_DOMAIN}>`
  const from = params.fromName ? `${encodeDisplayName(params.fromName)} <${params.from}>` : params.from

  const extraHeaders: Record<string, string> = { ...params.headers }
  if (params.inReplyTo) extraHeaders['In-Reply-To'] = params.inReplyTo
  const references = (params.references ?? []).filter((r): r is string => Boolean(r))
  if (references.length > 0) extraHeaders['References'] = references.join(' ')

  const raw = buildRfc2822Message({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    messageId: proposedMessageId,
    extraHeaders,
  })

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(params.threadId ? { threadId: params.threadId } : {}) },
  })
  const id = res.data.id
  if (!id) throw new Error('[gmail/sa] send returned no message id')

  return {
    id,
    threadId: res.data.threadId ?? null,
    rfcMessageId: (await readBackMessageId(gmail, id)) ?? proposedMessageId,
  }
}

/** The header Gmail actually stamped. Never fails a send that already went out. */
async function readBackMessageId(gmail: gmail_v1.Gmail, id: string): Promise<string | null> {
  try {
    const res = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['Message-ID'],
    })
    const header = res.data.payload?.headers?.find((h) => h.name?.toLowerCase() === 'message-id')
    return header?.value ?? null
  } catch (err) {
    console.warn('[gmail/sa] could not read back the Message-ID', { id, err: String(err) })
    return null
  }
}

function encodeDisplayName(name: string): string {
  if (/^[\x20-\x7e]*$/.test(name)) return /[",<>@]/.test(name) ? `"${name.replace(/"/g, '\\"')}"` : name
  return `=?utf-8?B?${Buffer.from(name).toString('base64')}?=`
}

// ── Read ─────────────────────────────────────────────────────────────────────

export interface InboxMessageRef {
  id: string
  threadId: string | null
}

/**
 * Ids of inbox messages received after `afterEpochSeconds`, oldest first,
 * excluding what the mailbox itself sent. Gmail's `after:` is day-granular
 * for dates but second-granular for epoch values, which is why we pass one.
 */
export async function listInboxSince(
  userEmail: string,
  opts: { afterEpochSeconds: number; max?: number }
): Promise<InboxMessageRef[]> {
  const gmail = gmailAsUser(userEmail)
  const max = opts.max ?? 100
  const out: InboxMessageRef[] = []
  let pageToken: string | undefined

  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: `in:inbox -from:me after:${Math.max(0, Math.floor(opts.afterEpochSeconds))}`,
      maxResults: Math.min(100, max - out.length),
      pageToken,
    })
    for (const m of res.data.messages ?? []) {
      if (m.id) out.push({ id: m.id, threadId: m.threadId ?? null })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken && out.length < max)

  return out.reverse()
}

export interface InboxMessage {
  id: string
  threadId: string | null
  fromEmail: string
  subject: string | null
  bodyText: string
  inReplyTo: string | null
  rfcMessageId: string | null
  receivedAt: string
}

export async function getInboxMessage(userEmail: string, id: string): Promise<InboxMessage> {
  const gmail = gmailAsUser(userEmail)
  const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
  const payload = res.data.payload
  const header = (name: string) =>
    payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null

  const fromHeader = header('From') ?? ''
  const angle = /<([^>]+)>/.exec(fromHeader)
  const fromEmail = (angle ? angle[1]! : fromHeader).trim()

  const receivedMs = res.data.internalDate ? Number(res.data.internalDate) : Date.now()

  return {
    id,
    threadId: res.data.threadId ?? null,
    fromEmail,
    subject: header('Subject'),
    bodyText: extractText(payload) || (res.data.snippet ?? ''),
    inReplyTo: header('In-Reply-To'),
    rfcMessageId: header('Message-ID'),
    receivedAt: new Date(receivedMs).toISOString(),
  }
}

/** text/plain wins; falls back to a crude strip of text/html. */
export function extractText(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return ''
  const plain = findPart(part, 'text/plain')
  if (plain) return decodeBody(plain)
  const html = findPart(part, 'text/html')
  if (html) return stripHtml(decodeBody(html))
  return ''
}

function findPart(
  part: gmail_v1.Schema$MessagePart,
  mime: string
): gmail_v1.Schema$MessagePart | null {
  if (part.mimeType === mime && part.body?.data) return part
  for (const child of part.parts ?? []) {
    const found = findPart(child, mime)
    if (found) return found
  }
  return null
}

function decodeBody(part: gmail_v1.Schema$MessagePart): string {
  const data = part.body?.data
  if (!data) return ''
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

