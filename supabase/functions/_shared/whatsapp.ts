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
 * Placeholder for a variable that resolved to nothing at send time. Meta rejects
 * an empty body parameter, so every position must carry something.
 *
 * SYNC: mirrors VAR_FALLBACKS in src/lib/whatsapp/submitTemplate.ts —
 * update both together.
 */
const VAR_FALLBACKS: Record<string, Record<string, string>> = {
  he: {
    teacher_name: 'המורה',
    student_name: 'התלמיד',
    parent_name: 'הורים יקרים',
    title: 'שיעורי בית',
    body: 'ראו פרטים באזור האישי',
    amount: '0',
    total: '0',
    score: '0',
    due_line: 'ללא תאריך הגשה',
    due_date: 'מחר',
    due_date_suffix: '',
    feedback_line: 'אין משוב נוסף.',
    decision: 'עודכנה',
    description: 'שיעור',
  },
  en: {
    teacher_name: 'your teacher',
    student_name: 'the student',
    parent_name: 'there',
    title: 'homework',
    body: 'See details in your personal area',
    amount: '0',
    total: '0',
    score: '0',
    due_line: 'No due date',
    due_date: 'tomorrow',
    due_date_suffix: '',
    feedback_line: 'No additional feedback.',
    decision: 'updated',
    description: 'a lesson',
  },
}

/**
 * Normalises one body parameter: Meta rejects newlines, tabs and empty strings.
 * SYNC: mirrors `param` in src/lib/whatsapp/approvedTemplates.ts.
 */
function metaParam(value: string | undefined, fallback: string): { type: 'text'; text: string } {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return { type: 'text', text: text || fallback }
}

/**
 * The org's own approved template for a type, or null to use the built-in one.
 *
 * SYNC: mirrors getApprovedCustomTemplate in src/lib/whatsapp/templateStatus.ts.
 * Never throws — on any failure the caller falls through to APPROVED_TEMPLATES,
 * because a lookup problem must not cost a parent their reminder.
 */
async function getApprovedCustomTemplate(
  // deno-lint-ignore no-explicit-any
  db: any,
  orgId: string,
  templateType: string,
  locale: string
): Promise<{ name: string; language: string; varOrder: string[] } | null> {
  try {
    const { data, error } = await db
      .from('whatsapp_template_statuses')
      .select('template_name, language, var_order')
      .eq('organization_id', orgId)
      .eq('type', templateType)
      .eq('language', locale)
      .eq('status', 'APPROVED')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn(`[sendSmart] Approved-template lookup failed — using built-in: ${error.message}`)
      return null
    }
    if (!data?.var_order) return null

    return { name: data.template_name, language: data.language, varOrder: data.var_order }
  } catch (err) {
    console.warn(`[sendSmart] Approved-template lookup threw — using built-in: ${String(err)}`)
    return null
  }
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
 * @param templateVars  ordered list of variable values for the built-in approved template body
 * @param locale  recipient language — picks the approved template variant
 * @param namedVars  the same variables keyed by name, as passed to resolveTemplate.
 *   Required to use a template the org authored itself: its parameter order comes
 *   from the org's own body, so positional `templateVars` cannot be reused. Omit
 *   it and the built-in template is always used.
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
  locale: string = 'he',
  namedVars?: Record<string, string>
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

  // Outside window — a template the org wrote itself and got approved wins, so
  // the copy an owner edited in settings is what actually reaches a parent.
  // Exact language match only: an org that approved Hebrew but not English
  // should still get the built-in English template below.
  if (namedVars) {
    const custom = await getApprovedCustomTemplate(db, orgId, templateType, locale)
    if (custom) {
      const components: MetaTemplateComponent[] = custom.varOrder.length > 0
        ? [{
            type: 'body',
            parameters: custom.varOrder.map((name) =>
              metaParam(namedVars[name], VAR_FALLBACKS[locale]?.[name] || VAR_FALLBACKS.he[name] || '-')
            ),
          }]
        : []
      await sendTemplateMessage(phone, accessToken, phoneNumberId, custom.name, custom.language, components)
      return
    }
  }

  // Built-in approved template in the recipient's language, falling back to
  // Hebrew. Text here would fail with error 131047.
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
