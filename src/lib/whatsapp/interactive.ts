/**
 * Interactive message senders — list messages and reply buttons.
 *
 * Free-form interactive messages are only valid INSIDE the 24h customer-service
 * window; outside it Meta rejects them with 131047 and an approved template with
 * quick-reply buttons is the only option. Every caller here is replying to an
 * inbound parent message, so the window is open by construction.
 *
 * Meta's size limits are hard errors, not warnings, so every field is truncated
 * at the boundary rather than trusted to be short.
 */

import { META_API_VERSION } from './graphVersion'
import { recordOutboundSend } from './messageLog'

// Meta interactive-message limits.
export const LIST_BUTTON_MAX = 20
export const LIST_ROW_TITLE_MAX = 24
export const LIST_ROW_DESC_MAX = 72
export const LIST_ROWS_MAX = 10
export const REPLY_BUTTON_TITLE_MAX = 20
export const REPLY_BUTTONS_MAX = 3
export const INTERACTIVE_BODY_MAX = 1024

export interface InteractiveRow {
  /** Payload echoed back on tap — see menu.ts for the encoding. */
  id: string
  title: string
  description?: string
}

function clip(value: string, max: number): string {
  const v = value.trim()
  return v.length <= max ? v : v.slice(0, max - 1).trimEnd() + '…'
}

async function postInteractive(
  to: string,
  interactive: Record<string, unknown>,
  accessToken: string,
  phoneNumberId: string,
  label: string,
  /** What the recipient reads — the transcript stores this, not the JSON. */
  logBody: string
): Promise<void> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`[whatsapp] ${label} API error`, { to, status: res.status, detail })
    throw new Error(`WhatsApp ${label} API error ${res.status}: ${detail}`)
  }

  recordOutboundSend(res, logBody, 'interactive')
}

/**
 * Sends a list message — a single "open menu" button revealing up to 10 rows.
 * Used when there are more options than the 3 reply buttons Meta allows.
 */
export async function sendListMessage(
  to: string,
  opts: { body: string; buttonLabel: string; sectionTitle?: string; rows: InteractiveRow[] },
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const rows = opts.rows.slice(0, LIST_ROWS_MAX).map((r) => ({
    id: r.id,
    title: clip(r.title, LIST_ROW_TITLE_MAX),
    ...(r.description ? { description: clip(r.description, LIST_ROW_DESC_MAX) } : {}),
  }))

  if (rows.length === 0) throw new Error('sendListMessage called with no rows')

  await postInteractive(
    to,
    {
      type: 'list',
      body: { text: clip(opts.body, INTERACTIVE_BODY_MAX) },
      action: {
        button: clip(opts.buttonLabel, LIST_BUTTON_MAX),
        sections: [
          {
            ...(opts.sectionTitle ? { title: clip(opts.sectionTitle, LIST_ROW_TITLE_MAX) } : {}),
            rows,
          },
        ],
      },
    },
    accessToken,
    phoneNumberId,
    'list',
    `${opts.body}\n${rows.map((r) => `• ${r.title}`).join('\n')}`
  )
}

/**
 * Sends an approved template whose registered quick-reply buttons carry our own
 * payloads. This is the only way to put tappable buttons in front of a parent
 * OUTSIDE the 24h window, where free-form interactive messages are rejected.
 *
 * Button payloads are bound at send time, not registration time: Meta stores
 * only the labels, and echoes the payload back in `button.payload` on tap.
 */
export async function sendTemplateWithQuickReplies(
  to: string,
  opts: {
    name: string
    languageCode: string
    bodyParams: string[]
    /** Payloads in button order; index must match the registered buttons. */
    payloads: string[]
  },
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`

  const components: Record<string, unknown>[] = []
  if (opts.bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: opts.bodyParams.map((text) => ({ type: 'text', text })),
    })
  }
  opts.payloads.slice(0, REPLY_BUTTONS_MAX).forEach((payload, index) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(index),
      parameters: [{ type: 'payload', payload }],
    })
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: opts.name,
        language: { code: opts.languageCode },
        components,
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[whatsapp] quick-reply template API error', {
      to,
      name: opts.name,
      status: res.status,
      detail,
    })
    throw new Error(`WhatsApp quick-reply template API error ${res.status}: ${detail}`)
  }

  recordOutboundSend(res, `[template: ${opts.name}]`, 'template')
}

/**
 * Sends up to three tappable reply buttons. Prefer this over a list when the
 * options fit — the buttons are visible without an extra tap.
 */
export async function sendReplyButtons(
  to: string,
  opts: { body: string; buttons: Array<{ id: string; title: string }> },
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const buttons = opts.buttons.slice(0, REPLY_BUTTONS_MAX).map((b) => ({
    type: 'reply' as const,
    reply: { id: b.id, title: clip(b.title, REPLY_BUTTON_TITLE_MAX) },
  }))

  if (buttons.length === 0) throw new Error('sendReplyButtons called with no buttons')

  await postInteractive(
    to,
    {
      type: 'button',
      body: { text: clip(opts.body, INTERACTIVE_BODY_MAX) },
      action: { buttons },
    },
    accessToken,
    phoneNumberId,
    'reply buttons',
    `${opts.body}\n${buttons.map((b) => `• ${b.reply.title}`).join('\n')}`
  )
}
