/**
 * parsePayload — extracts messages from a Meta WhatsApp Cloud API webhook payload.
 * Per Meta docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 *
 * Returns an array of extracted messages (usually 0 or 1 per webhook call).
 */

export interface WhatsAppMessage {
  /** E.164-ish sender phone (from Meta — may need normalizePhone before DB lookup) */
  from: string
  messageId: string
  text: string
  /** Display phone number of the receiving business WhatsApp line */
  businessPhoneNumber: string
  /** Meta phone_number_id of the receiving business line */
  phoneNumberId: string
}

// Minimal structural types for the Meta payload
interface MetaTextMessage {
  from: string
  id: string
  type: 'text'
  text: { body: string }
}

interface MetaValue {
  messaging_product: string
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  messages?: MetaTextMessage[]
}

interface MetaChange {
  value: MetaValue
  field: string
}

interface MetaEntry {
  id: string
  changes: MetaChange[]
}

export interface MetaWebhookPayload {
  object: string
  entry: MetaEntry[]
}

export function parseWebhookPayload(body: unknown): WhatsAppMessage[] {
  const payload = body as MetaWebhookPayload
  if (payload?.object !== 'whatsapp_business_account') return []

  const results: WhatsAppMessage[] = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue
      const { metadata, messages } = change.value
      if (!messages) continue

      for (const msg of messages) {
        if (msg.type !== 'text') continue
        results.push({
          from: msg.from,
          messageId: msg.id,
          text: msg.text.body,
          businessPhoneNumber: metadata.display_phone_number,
          phoneNumberId: metadata.phone_number_id,
        })
      }
    }
  }

  return results
}

/** Returns true if the message text contains a booking intent keyword. */
export function hasBookingIntent(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('קביעה') || lower.includes('שיעור')
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
