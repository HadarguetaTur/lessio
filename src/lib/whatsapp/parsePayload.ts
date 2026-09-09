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
  /**
   * Set when the sender sent something we cannot act on (audio, sticker,
   * location, contacts…). `text` is empty in that case. The webhook answers
   * with a short "text only" notice instead of silence.
   */
  unsupportedType?: string
  /**
   * Set for an inbound image or document. `text` carries the caption (may be
   * empty). Only the exam-report flow consumes media today; everywhere else a
   * media message still gets the unsupported-media notice from the webhook.
   */
  media?: {
    id: string
    mimeType: string
    fileName?: string
    kind: 'image' | 'document'
  }
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
  // Inbound media — only image/document are consumed (exam-report flow).
  image: z
    .object({ id: z.string().min(1), mime_type: z.string().min(1), caption: z.string().optional() })
    .optional(),
  document: z
    .object({
      id: z.string().min(1),
      mime_type: z.string().min(1),
      filename: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
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
        if (!extracted) {
          // Reactions and `unsupported` (Meta's own marker for types it could
          // not deliver) are not a person asking for something — stay silent.
          // Everything else is a real message we cannot read: a photo of a
          // homework page, a voice note — and deserves an answer.
          if (msg.type === 'reaction' || msg.type === 'unsupported') continue
          results.push({
            from: msg.from,
            messageId: msg.id,
            text: '',
            unsupportedType: msg.type,
            businessPhoneNumber: metadata.display_phone_number,
            phoneNumberId: metadata.phone_number_id,
          })
          continue
        }
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

// ── Delivery statuses ─────────────────────────────────────────────────────────

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

/** One `statuses[]` entry of a `messages` change — the fate of a message we sent. */
export interface DeliveryStatusUpdate {
  /** Meta phone_number_id of the business line that sent the message. */
  phoneNumberId: string
  /** The wamid we stored on the outbound row when Meta accepted the send. */
  waMessageId: string
  status: DeliveryStatus
  /** Meta's error for a `failed` status; null otherwise. */
  errorCode: number | null
  errorMessage: string | null
}

const StatusErrorSchema = z.object({
  code: z.number().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  error_data: z.object({ details: z.string().optional() }).optional(),
})

const MetaStatusSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  errors: z.array(StatusErrorSchema).optional(),
})

const StatusesValueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().min(1) }),
  statuses: z.array(MetaStatusSchema).optional(),
})

/**
 * Extracts delivery transitions from a webhook payload.
 *
 * They ride in the same `messages` change as inbound messages, under
 * `value.statuses`, and are validated separately so a malformed status never
 * costs a real message batched next to it (and vice versa). Statuses Meta
 * defines but we do not track (`deleted`, `warning`) are dropped.
 */
export function parseDeliveryStatuses(body: unknown): DeliveryStatusUpdate[] {
  const parsed = MetaWebhookPayloadSchema.safeParse(body)
  if (!parsed.success) return []

  const results: DeliveryStatusUpdate[] = []

  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const value = StatusesValueSchema.safeParse(change.value)
      if (!value.success) continue

      for (const status of value.data.statuses ?? []) {
        const normalized = status.status.toLowerCase()
        if (!isDeliveryStatus(normalized)) continue

        const firstError = status.errors?.[0]
        const detail = firstError?.error_data?.details
        const errorMessage = firstError
          ? [firstError.title ?? firstError.message, detail].filter(Boolean).join(' — ') || null
          : null

        results.push({
          phoneNumberId: value.data.metadata.phone_number_id,
          waMessageId: status.id,
          status: normalized,
          errorCode: firstError?.code ?? null,
          errorMessage,
        })
      }
    }
  }

  return results
}

function isDeliveryStatus(value: string): value is DeliveryStatus {
  return value === 'sent' || value === 'delivered' || value === 'read' || value === 'failed'
}

/**
 * Normalises the three inbound shapes we act on into { text, replyId }.
 * Everything else (images, audio, reactions, …) returns null; the caller
 * decides whether that is dropped or surfaced as an unsupported message.
 */
function extractContent(
  msg: z.infer<typeof MetaMessageSchema>
): { text: string; replyId?: string; media?: WhatsAppMessage['media'] } | null {
  if (msg.type === 'text' && msg.text) {
    return { text: msg.text.body }
  }

  if (msg.type === 'image' && msg.image) {
    return {
      text: msg.image.caption ?? '',
      media: { id: msg.image.id, mimeType: msg.image.mime_type, kind: 'image' },
    }
  }

  if (msg.type === 'document' && msg.document) {
    return {
      text: msg.document.caption ?? '',
      media: {
        id: msg.document.id,
        mimeType: msg.document.mime_type,
        fileName: msg.document.filename,
        kind: 'document',
      },
    }
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

// ── Number / account health updates ───────────────────────────────────────────

/**
 * One health-related change, resolved to its WABA (entry[].id).
 *
 * Meta reports the number's standing through several subscribed fields:
 *   - phone_number_quality_update: FLAGGED / UNFLAGGED (quality rating), and
 *     UPGRADE / DOWNGRADE (messaging tier, in `current_limit`)
 *   - account_update: VERIFIED_ACCOUNT, DISABLED_UPDATE, ACCOUNT_VIOLATION,
 *     ACCOUNT_RESTRICTION, ACCOUNT_DELETED, PARTNER_REMOVED …
 *   - phone_number_name_update: display-name decision
 *
 * The webhook stores what the event states outright and then re-reads the full
 * snapshot from Meta (src/lib/whatsapp/health.ts), so this type carries only
 * the facts needed to decide whether to alert the owner.
 */
export interface AccountHealthUpdate {
  wabaId: string
  field: 'phone_number_quality_update' | 'account_update' | 'phone_number_name_update'
  /** Meta's event / decision, upper-cased. */
  event: string
  /** New messaging tier when the event is a tier change, e.g. TIER_2K. */
  currentLimit: string | null
  /** Meta's explanation, when it sends one (restrictions, name rejection). */
  detail: string | null
}

const HealthValueSchema = z.object({
  event: z.string().optional(),
  decision: z.string().optional(),
  current_limit: z.string().optional(),
  rejection_reason: z.string().nullish(),
  ban_info: z.object({ waba_ban_state: z.string().optional() }).optional(),
  restriction_info: z
    .array(z.object({ restriction_type: z.string().optional(), expiration: z.string().optional() }))
    .optional(),
})

const HEALTH_FIELDS = new Set<AccountHealthUpdate['field']>([
  'phone_number_quality_update',
  'account_update',
  'phone_number_name_update',
])

export function parseAccountHealthUpdates(body: unknown): AccountHealthUpdate[] {
  const parsed = MetaWebhookPayloadSchema.safeParse(body)
  if (!parsed.success) return []

  const results: AccountHealthUpdate[] = []

  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const field = change.field as AccountHealthUpdate['field']
      if (!HEALTH_FIELDS.has(field)) continue

      const value = HealthValueSchema.safeParse(change.value)
      if (!value.success) continue

      const event = (value.data.event ?? value.data.decision ?? '').toUpperCase()
      if (!event) continue

      const detailParts = [
        value.data.rejection_reason && value.data.rejection_reason.toUpperCase() !== 'NONE'
          ? value.data.rejection_reason
          : null,
        value.data.ban_info?.waba_ban_state ?? null,
        ...(value.data.restriction_info ?? []).map((r) => r.restriction_type ?? null),
      ].filter((p): p is string => Boolean(p))

      results.push({
        wabaId: entry.id,
        field,
        event,
        currentLimit: value.data.current_limit ?? null,
        detail: detailParts.length > 0 ? detailParts.join(', ') : null,
      })
    }
  }

  return results
}
