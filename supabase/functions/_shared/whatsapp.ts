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
 * Must be kept in sync with src/lib/whatsapp/approvedTemplates.ts.
 */
const APPROVED_TEMPLATES: Record<string, { name: string; languageCode: string; bodyParamCount: number }> = {
  lesson_reminder:  { name: 'lessio_lesson_reminder_he',  languageCode: 'he', bodyParamCount: 3 },
  payment_reminder: { name: 'lessio_payment_reminder_he', languageCode: 'he', bodyParamCount: 2 },
  homework_reminder: { name: 'lessio_homework_reminder_he', languageCode: 'he', bodyParamCount: 3 },
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
  templateVars: string[] = []
): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: recent } = await db
    .from('whatsapp_processed_messages')
    .select('id')
    .eq('organization_id', orgId)
    .eq('from_phone', phone)
    .gt('created_at', cutoff)
    .limit(1)
    .maybeSingle()

  if (recent) {
    // Within 24h window — plain text
    await sendTextMessage(phone, textBody, accessToken, phoneNumberId)
    return
  }

  // Outside window — approved template
  const tmpl = APPROVED_TEMPLATES[templateType]
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
