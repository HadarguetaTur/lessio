/**
 * parsePayload — extracts messages from a Meta WhatsApp Cloud API webhook payload.
 * Per Meta docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 *
 * Returns an array of extracted messages (usually 0 or 1 per webhook call).
 */

import { z } from 'zod'

export interface WhatsAppMessage {
  /** E.164-ish sender phone (from Meta — may need normalizePhone before DB lookup) */
  from: string
  messageId: string
  /**
   * Free text the user typed. For an interactive reply this holds the tapped
   * label, so keyword intent detection keeps working as a second line of defence.
   */
  text: string
  /**
   * Payload id of a tapped button or list row (e.g. "action:book:<studentId>"),
   * or undefined for a typed message. This is what the menu router dispatches on.
   */
  replyId?: string
  /** Display phone number of the receiving business WhatsApp line */
  businessPhoneNumber: string
  /** Meta phone_number_id of the receiving business line */
  phoneNumberId: string
}

const MetaMessageSchema = z.object({
  from: z.string().min(1),
  id: z.string().min(1),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
  // Reply to an interactive list / reply-button message we sent.
  interactive: z
    .object({
      type: z.string().optional(),
      button_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
    })
    .optional(),
  // Reply to a quick-reply button on an approved template.
  button: z.object({ payload: z.string().optional(), text: z.string().optional() }).optional(),
})

const MetaWebhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.string(),
            metadata: z.object({
              display_phone_number: z.string().min(1),
              phone_number_id: z.string().min(1),
            }),
            messages: z.array(MetaMessageSchema).optional(),
          }),
        })
      ).default([]),
    })
  ).default([]),
})

export type MetaWebhookPayload = z.infer<typeof MetaWebhookPayloadSchema>

export function parseWebhookPayload(body: unknown): WhatsAppMessage[] {
  const parsed = MetaWebhookPayloadSchema.safeParse(body)
  if (!parsed.success) return []

  const payload = parsed.data

  const results: WhatsAppMessage[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue
      const { metadata, messages } = change.value
      if (!messages) continue

      for (const msg of messages) {
        const extracted = extractContent(msg)
        if (!extracted) continue
        results.push({
          from: msg.from,
          messageId: msg.id,
          ...extracted,
          businessPhoneNumber: metadata.display_phone_number,
          phoneNumberId: metadata.phone_number_id,
        })
      }
    }
  }

  return results
}

/**
 * Normalises the three inbound shapes we act on into { text, replyId }.
 * Everything else (images, audio, reactions, status updates) returns null and
 * is dropped, as before.
 */
function extractContent(
  msg: z.infer<typeof MetaMessageSchema>
): { text: string; replyId?: string } | null {
  if (msg.type === 'text' && msg.text) {
    return { text: msg.text.body }
  }

  if (msg.type === 'interactive' && msg.interactive) {
    const reply = msg.interactive.button_reply ?? msg.interactive.list_reply
    if (reply) return { text: reply.title ?? '', replyId: reply.id }
    return null
  }

  // Quick-reply button on an approved template: the payload we registered comes
  // back in `button.payload`, with the visible label in `button.text`.
  if (msg.type === 'button' && msg.button) {
    const payload = msg.button.payload ?? msg.button.text
    if (payload) return { text: msg.button.text ?? payload, replyId: payload }
    return null
  }

  return null
}

/** Returns true if the message text contains a booking intent keyword. */
export function hasBookingIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes('קביעה') ||
    lower.includes('לקבוע') ||
    lower.includes('לקבוע שיעור') ||
    lower.includes('להזמין שיעור') ||
    lower.includes('הזמנה') ||
    lower.includes('book')
  )
}

/**
 * Returns true if the message text contains a cancellation intent keyword.
 * Keywords: "ביטול", "לבטל", "cancel" — case-insensitive contains match.
 * Per /docs/sprint-4-scope.md § WhatsApp Cancellation — Intent Rules.
 */
export function hasCancellationIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('ביטול') || lower.includes('לבטל') || lower.includes('cancel')
}
