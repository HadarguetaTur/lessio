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

/** The `value` of a `messages` change. Validated per-change, not payload-wide. */
const MessagesValueSchema = z.object({
  messaging_product: z.string(),
  metadata: z.object({
    display_phone_number: z.string().min(1),
    phone_number_id: z.string().min(1),
  }),
  messages: z.array(MetaMessageSchema).optional(),
})

/**
 * The envelope only. `value` stays unknown here and is validated per change
 * against the shape that change's `field` implies.
 *
 * This matters: Meta delivers other subscribed fields — most notably
 * `message_template_status_update` — through the same envelope, and they carry
 * nothing resembling the messages shape. Requiring that shape payload-wide made
 * one status change fail the whole safeParse, silently dropping any real
 * messages batched into the same delivery.
 */
const MetaWebhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.unknown(),
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

      // A malformed `messages` change is skipped on its own, leaving the rest of
      // the delivery to be processed.
      const value = MessagesValueSchema.safeParse(change.value)
      if (!value.success) continue

      const { metadata, messages } = value.data
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

// ── Template status updates ───────────────────────────────────────────────────

/** One `message_template_status_update` change, already resolved to its WABA. */
export interface TemplateStatusUpdate {
  /** entry[].id — the WhatsApp Business Account the template belongs to. */
  wabaId: string
  templateName: string
  language: string
  /** Meta's new status, e.g. APPROVED / REJECTED / PAUSED / DISABLED. */
  status: string
  /** Rejection reason. Meta sends the literal "NONE" when there is none. */
  reason: string | null
}

const TemplateStatusValueSchema = z.object({
  event: z.string().min(1),
  message_template_name: z.string().min(1),
  message_template_language: z.string().min(1),
  reason: z.string().nullish(),
})

/**
 * Extracts template approval transitions from a webhook payload.
 *
 * Meta identifies the account by `entry[].id` (the WABA id) rather than by a
 * phone_number_id, so callers resolve the org via `organizations.whatsapp_waba_id`
 * — not the `whatsapp_phone_number_id` used for inbound messages.
 */
export function parseTemplateStatusUpdates(body: unknown): TemplateStatusUpdate[] {
  const parsed = MetaWebhookPayloadSchema.safeParse(body)
  if (!parsed.success) return []

  const results: TemplateStatusUpdate[] = []

  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'message_template_status_update') continue

      const value = TemplateStatusValueSchema.safeParse(change.value)
      if (!value.success) continue

      const reason = value.data.reason
      results.push({
        wabaId: entry.id,
        templateName: value.data.message_template_name,
        language: value.data.message_template_language,
        status: value.data.event.toUpperCase(),
        reason: reason && reason.toUpperCase() !== 'NONE' ? reason : null,
      })
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

/**
 * Returns true if the message asks to stop business-initiated messages.
 *
 * Anchored to the whole message, unlike the other detectors: "stop" appears
 * inside ordinary sentences ("stop sending me the 8am one, the evening one is
 * fine"), and silently unsubscribing someone who was mid-conversation is worse
 * than missing an opt-out they can repeat. Meta's own stop words are single
 * words sent alone, which is what this matches.
 */
export function hasOptOutIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, '')
  return /^(stop|unsubscribe|stop messages|opt out|הסר|הסר אותי|הפסק|הפסיקו|עצור|הסירו אותי)$/.test(
    normalized
  )
}

/** Returns true if the message asks to resume messages after an opt-out. */
export function hasResumeIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, '')
  return /^(start|resume|subscribe|unstop|התחל|חדשו|המשך|הצטרף)$/.test(normalized)
}
