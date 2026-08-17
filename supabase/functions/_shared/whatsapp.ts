/**
 * Minimal WhatsApp Cloud API client for Supabase Edge Functions.
 * Mirrors the relevant parts of src/lib/whatsapp/index.ts but uses
 * the Deno fetch API (no Node.js required).
 *
 * Sprint 23: Added sendTemplateMessage + sendSmartMessage.
 */

const META_API_VERSION = 'v19.0'

/**
 * Sends a plain-text WhatsApp message.
 * Throws on non-2xx response.
 */
export async function sendTextMessage(
  to: string,
  text: string,
  accessToken: string,
  phoneNumberId: string
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
      type: 'text',
      text: { body: text },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`WhatsApp API error ${res.status}: ${detail}`)
  }
}

// deno-lint-ignore no-explicit-any
type MetaTemplateComponent = Record<string, any>

/**
 * Sends a Meta-approved WhatsApp template message.
 * Used when the 24h customer-service window has expired.
 */
export async function sendTemplateMessage(
  to: string,
  accessToken: string,
  phoneNumberId: string,
  templateName: string,
  languageCode: string,
  components: MetaTemplateComponent[] = []
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
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components.length > 0 ? components : undefined,
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`WhatsApp template API error ${res.status}: ${detail}`)
  }
}

/**
 * Approved template specs for Edge Function use.
 * SYNC: must be kept in sync with src/lib/whatsapp/approvedTemplates.ts
 * (and template names with src/lib/whatsapp/registerTemplates.ts) —
 * update all files together.
 */
const APPROVED_TEMPLATES: Record<
  string,
  Record<string, { name: string; languageCode: string; bodyParamCount: number }>
> = {
  he: {
    lesson_reminder:  { name: 'lessio_lesson_reminder_he_v2',  languageCode: 'he', bodyParamCount: 3 },
    payment_reminder: { name: 'lessio_payment_reminder_he_v2', languageCode: 'he', bodyParamCount: 2 },
    payment_request:  { name: 'lessio_payment_request_he_v2',  languageCode: 'he', bodyParamCount: 2 },
    homework_reminder: { name: 'lessio_homework_reminder_he_v2', languageCode: 'he', bodyParamCount: 3 },
    homework_assignment: { name: 'lessio_homework_assignment_he_v2', languageCode: 'he', bodyParamCount: 3 },
    homework_graded: { name: 'lessio_homework_graded_he_v2', languageCode: 'he', bodyParamCount: 3 },
  },
  en: {
    lesson_reminder:  { name: 'lessio_lesson_reminder_en_v2',  languageCode: 'en', bodyParamCount: 3 },
    payment_reminder: { name: 'lessio_payment_reminder_en_v2', languageCode: 'en', bodyParamCount: 2 },
    payment_request:  { name: 'lessio_payment_request_en_v2',  languageCode: 'en', bodyParamCount: 2 },
    homework_reminder: { name: 'lessio_homework_reminder_en_v2', languageCode: 'en', bodyParamCount: 3 },
    homework_assignment: { name: 'lessio_homework_assignment_en_v2', languageCode: 'en', bodyParamCount: 3 },
    homework_graded: { name: 'lessio_homework_graded_en_v2', languageCode: 'en', bodyParamCount: 3 },
  },
}

/**
 * Session-window aware send. Mirrors src/lib/whatsapp/sendSmart.ts.
 *
 * @param db  Supabase service-role client
 * @param orgId
 * @param phone  normalised E.164 phone
 * @param accessToken  decrypted WhatsApp token
 * @param phoneNumberId
 * @param templateType  key in APPROVED_TEMPLATES
 * @param textBody  resolved text body (used within session window)
 * @param templateVars  ordered list of variable values for the approved template body
 * @param locale  recipient language — picks the approved template variant
 */
// deno-lint-ignore no-explicit-any
export async function sendSmartMessage(
  // deno-lint-ignore no-explicit-any
  db: any,
  orgId: string,
  phone: string,
  accessToken: string,
  phoneNumberId: string,
  templateType: string,
  textBody: string,
  templateVars: string[] = [],
  locale: string = 'he'
): Promise<void> {
  // Opt-out gate. The crons are the highest-volume business-initiated sender in
  // the product, so enforcing only in the Node path (src/lib/whatsapp/sendSmart.ts)
  // would leave an opted-out parent still receiving daily reminders.
  // Fails open on a DB error, matching src/lib/whatsapp/optOut.ts.
  const { data: parent, error: optOutError } = await db
    .from('parents')
    .select('opted_out_at')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle()

  if (optOutError) {
    console.warn(`[sendSmart] opt-out lookup failed — allowing the send: ${optOutError.message}`)
  } else if (parent?.opted_out_at) {
    console.info(`[sendSmart] Recipient opted out — skipping ${templateType}`)
    return
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: recent } = await db
    .from('whatsapp_processed_messages')
    .select('message_id')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .gt('created_at', cutoff)
    .limit(1)
    .maybeSingle()

  if (recent) {
    // Within 24h window — plain text
    await sendTextMessage(phone, textBody, accessToken, phoneNumberId)
    return
  }

  // Outside window — approved template in the recipient's language, falling
  // back to Hebrew. Text here would fail with error 131047.
  const tmpl = APPROVED_TEMPLATES[locale]?.[templateType] ?? APPROVED_TEMPLATES.he[templateType]
  if (tmpl) {
    const components: MetaTemplateComponent[] = templateVars.length > 0
      ? [{
          type: 'body',
          parameters: templateVars.map((t) => ({ type: 'text', text: t })),
        }]
      : []
    await sendTemplateMessage(phone, accessToken, phoneNumberId, tmpl.name, tmpl.languageCode, components)
    return
  }

  // Fallback to text (no approved template registered)
  console.warn(`[sendSmart] No approved template for ${templateType} — falling back to text`)
  await sendTextMessage(phone, textBody, accessToken, phoneNumberId)
}
