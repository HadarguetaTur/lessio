/**
 * Minimal WhatsApp Cloud API client for Supabase Edge Functions.
 * Mirrors the relevant parts of src/lib/whatsapp/index.ts but uses
 * the Deno fetch API (no Node.js required).
 *
 * Sprint 23: Added sendTemplateMessage + sendSmartMessage.
 */

// Keep in sync with src/lib/whatsapp/graphVersion.ts — Deno cannot import from src/.
const META_API_VERSION = 'v26.0'

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MetaTemplateComponent = Record<string, any>

/**
 * The Supabase service-role client. Untyped because Edge Functions cannot
 * import the generated database types from src/, and hand-writing them here
 * would be a third copy to keep in sync.
 */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

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
 * Sends up to three reply buttons alongside a body.
 * SYNC: mirrors sendReplyButtons in src/lib/whatsapp/interactive.ts.
 *
 * Only valid INSIDE the 24h window — outside it Meta rejects interactive
 * messages with 131047, and the quick-reply template below is the only option.
 */
export async function sendReplyButtons(
  to: string,
  opts: { body: string; buttons: Array<{ id: string; title: string }> },
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
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: clip(opts.body, 1024) },
        action: {
          buttons: opts.buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: clip(b.title, 20) },
          })),
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`WhatsApp reply-buttons API error ${res.status}: ${detail}`)
  }
}

/**
 * Sends an approved template that was registered WITH quick-reply buttons,
 * binding one payload per button at send time.
 * SYNC: mirrors sendTemplateWithQuickReplies in src/lib/whatsapp/interactive.ts.
 */
export async function sendTemplateWithQuickReplies(
  to: string,
  opts: { name: string; languageCode: string; bodyParams: string[]; payloads: string[] },
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const components: MetaTemplateComponent[] = []

  if (opts.bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: opts.bodyParams.map((t) => ({ type: 'text', text: t })),
    })
  }

  opts.payloads.forEach((payload, i) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(i),
      parameters: [{ type: 'payload', payload }],
    })
  })

  await sendTemplateMessage(
    to,
    accessToken,
    phoneNumberId,
    opts.name,
    opts.languageCode,
    components
  )
}

/**
 * Sends a body with a single URL button.
 * SYNC: mirrors sendCtaUrlMessage in src/lib/whatsapp/index.ts.
 */
export async function sendCtaUrlMessage(
  to: string,
  body: string,
  buttonText: string,
  linkUrl: string,
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
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: clip(body, 1024) },
        action: {
          name: 'cta_url',
          parameters: { display_text: clip(buttonText, 20), url: linkUrl },
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`WhatsApp cta_url API error ${res.status}: ${detail}`)
  }
}

/** Meta's size limits are hard errors, so every field is truncated at the boundary. */
function clip(value: string, max: number): string {
  const v = value.trim()
  return v.length <= max ? v : v.slice(0, max - 1).trimEnd() + '…'
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
    welcome_notice: { name: 'lessio_welcome_notice_he_v2', languageCode: 'he', bodyParamCount: 1 },
  },
  en: {
    lesson_reminder:  { name: 'lessio_lesson_reminder_en_v2',  languageCode: 'en', bodyParamCount: 3 },
    payment_reminder: { name: 'lessio_payment_reminder_en_v2', languageCode: 'en', bodyParamCount: 2 },
    payment_request:  { name: 'lessio_payment_request_en_v2',  languageCode: 'en', bodyParamCount: 2 },
    homework_reminder: { name: 'lessio_homework_reminder_en_v2', languageCode: 'en', bodyParamCount: 3 },
    homework_assignment: { name: 'lessio_homework_assignment_en_v2', languageCode: 'en', bodyParamCount: 3 },
    homework_graded: { name: 'lessio_homework_graded_en_v2', languageCode: 'en', bodyParamCount: 3 },
    welcome_notice: { name: 'lessio_welcome_notice_en_v2', languageCode: 'en', bodyParamCount: 1 },
  },
}

/**
 * Templates registered WITH quick-reply buttons (the v3 set).
 * SYNC: mirrors QUICK_REPLY_TEMPLATES in src/lib/whatsapp/approvedTemplates.ts.
 *
 * The bodies are identical to their v2 twins above, which is what lets the
 * same positional `templateVars` feed either — and lets a send degrade to the
 * button-less v2 while v3 is still PENDING at Meta.
 */
const QUICK_REPLY_TEMPLATES: Record<string, Record<string, { name: string; languageCode: string }>> = {
  he: {
    lesson_reminder: { name: 'lessio_lesson_reminder_he_v3', languageCode: 'he' },
    homework_assignment: { name: 'lessio_homework_assignment_he_v3', languageCode: 'he' },
    homework_reminder: { name: 'lessio_homework_reminder_he_v3', languageCode: 'he' },
  },
  en: {
    lesson_reminder: { name: 'lessio_lesson_reminder_en_v3', languageCode: 'en' },
    homework_assignment: { name: 'lessio_homework_assignment_en_v3', languageCode: 'en' },
    homework_reminder: { name: 'lessio_homework_reminder_en_v3', languageCode: 'en' },
  },
}

/**
 * Payment templates registered with a URL button pointing at /pay/<chargeId>.
 * SYNC: mirrors URL_BUTTON_TEMPLATES in src/lib/whatsapp/approvedTemplates.ts.
 *
 * Their bodies differ from the v2 twins: the line holding the bare link is
 * gone, so payment_reminder takes name + amount and nothing else.
 */
const URL_BUTTON_TEMPLATES: Record<string, Record<string, { name: string; languageCode: string }>> = {
  he: {
    payment_request: { name: 'lessio_payment_request_he_v3', languageCode: 'he' },
    payment_reminder: { name: 'lessio_payment_reminder_he_v3', languageCode: 'he' },
  },
  en: {
    payment_request: { name: 'lessio_payment_request_en_v3', languageCode: 'en' },
    payment_reminder: { name: 'lessio_payment_reminder_en_v3', languageCode: 'en' },
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
 * Business-send gate: opt-out plus the one-time welcome notice.
 * SYNC: mirrors prepareBusinessSend in src/lib/whatsapp/consent.ts.
 *
 * The crons are the highest-volume business-initiated sender in the product,
 * so enforcing only in the Node path would leave an opted-out parent still
 * receiving daily reminders, and a brand-new parent getting a reminder with no
 * explanation of who is writing. Fails open on DB errors, matching the Node side.
 */
export async function prepareBusinessSend(
  // deno-lint-ignore no-explicit-any
  db: any,
  orgId: string,
  phone: string,
  accessToken: string,
  phoneNumberId: string,
  locale: string = 'he'
): Promise<{ ok: true } | { ok: false; reason: 'opted_out' }> {
  const { data: parent, error: optOutError } = await db
    .from('parents')
    .select('opted_out_at')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .maybeSingle()

  if (optOutError) {
    console.warn(`[sendSmart] opt-out lookup failed — allowing the send: ${optOutError.message}`)
  } else if (parent?.opted_out_at) {
    return { ok: false, reason: 'opted_out' }
  }

  // Atomic claim of the welcome notice: only the caller that flips NULL → now()
  // sends it, so two crons racing on one parent cannot both send.
  const { data: claimed, error: claimError } = await db
    .from('parents')
    .update({ welcome_sent_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .is('welcome_sent_at', null)
    .select('id')

  if (claimError) {
    console.warn(`[consent] welcome claim failed — skipping the notice: ${claimError.message}`)
    return { ok: true }
  }
  const claimedParent = claimed?.[0]
  if (!claimedParent) return { ok: true }

  try {
    const { data: org } = await db
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()

    const tmpl = APPROVED_TEMPLATES[locale]?.welcome_notice ?? APPROVED_TEMPLATES.he.welcome_notice
    const fallbackName = locale === 'en' ? 'your tutor' : 'בית הספר'
    await sendTemplateMessage(phone, accessToken, phoneNumberId, tmpl.name, tmpl.languageCode, [
      { type: 'body', parameters: [metaParam(org?.name, fallbackName)] },
    ])
    console.info(`[consent] welcome notice sent to parent ${claimedParent.id}`)
  } catch (err) {
    // Release the claim so the next send retries — usually the template is
    // still PENDING at Meta. The business message still goes out.
    console.warn(`[consent] welcome notice failed — will retry on next send: ${String(err)}`)
    const { error: releaseError } = await db
      .from('parents')
      .update({ welcome_sent_at: null })
      .eq('id', claimedParent.id)
    if (releaseError) console.error(`[consent] failed to release welcome claim: ${releaseError.message}`)
  }

  return { ok: true }
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
  const gate = await prepareBusinessSend(db, orgId, phone, accessToken, phoneNumberId, locale)
  if (!gate.ok) {
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

/**
 * A session-window aware send that carries buttons — a lesson reminder the
 * parent can confirm, a homework message they can mark done.
 *
 * A separate function rather than more positional parameters on
 * sendSmartMessage, which is already ten arguments deep.
 *
 * The ladder, and why each rung exists:
 *
 *   1. Inside the 24h window → a free-form interactive message. Buttons and
 *      the org's own copy both survive.
 *   2. Outside it, org has its own APPROVED template → that template, WITHOUT
 *      buttons. An owner who rewrote the copy in settings gets their wording;
 *      body-only submissions cannot carry buttons, and their copy matters more
 *      than the tap.
 *   3. Otherwise the built-in v3 template, buttons bound at send time.
 *   4. Anything above throwing (v3 still PENDING at Meta is the usual reason)
 *      falls back to the plain sendSmartMessage path, i.e. v2 without buttons.
 *      A reminder that arrives without a button beats no reminder.
 */
export async function sendSmartInteractive(
  db: Db,
  opts: {
    orgId: string
    phone: string
    accessToken: string
    phoneNumberId: string
    templateType: string
    textBody: string
    templateVars?: string[]
    locale?: string
    namedVars?: Record<string, string>
    /** One payload per button, in the order the template registers them. */
    payloads: string[]
    /** Button labels for the in-window interactive message. */
    buttonLabels: string[]
  }
): Promise<void> {
  const {
    orgId,
    phone,
    accessToken,
    phoneNumberId,
    templateType,
    textBody,
    templateVars = [],
    locale = 'he',
    namedVars,
    payloads,
    buttonLabels,
  } = opts

  const gate = await prepareBusinessSend(db, orgId, phone, accessToken, phoneNumberId, locale)
  if (!gate.ok) {
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

  try {
    if (recent) {
      await sendReplyButtons(
        phone,
        {
          body: textBody,
          buttons: payloads.map((id, i) => ({ id, title: buttonLabels[i] ?? '' })),
        },
        accessToken,
        phoneNumberId
      )
      return
    }

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

    const tmpl = QUICK_REPLY_TEMPLATES[locale]?.[templateType] ?? QUICK_REPLY_TEMPLATES.he[templateType]
    if (tmpl) {
      await sendTemplateWithQuickReplies(
        phone,
        {
          name: tmpl.name,
          languageCode: tmpl.languageCode,
          bodyParams: templateVars,
          payloads,
        },
        accessToken,
        phoneNumberId
      )
      return
    }
  } catch (err) {
    console.warn(
      `[sendSmart] Buttoned ${templateType} failed — retrying without buttons: ${String(err)}`
    )
  }

  // The welcome-notice claim in prepareBusinessSend is idempotent once sent, so
  // running the plain path here does not double-send it.
  await sendSmartMessage(
    db,
    orgId,
    phone,
    accessToken,
    phoneNumberId,
    templateType,
    textBody,
    templateVars,
    locale,
    namedVars
  )
}

/**
 * A payment message whose link is a button rather than a bare URL in the body.
 * SYNC: mirrors sendPaymentWithButton in src/lib/whatsapp/sendSmart.ts.
 *
 * Inside the window the button points straight at the provider's checkout;
 * outside it, Meta only accepts a dynamic SUFFIX on a fixed base, so the
 * charge id goes out instead and /pay/<id> resolves it. Any failure falls back
 * to sendSmartMessage — the inline link. While the v3 templates are PENDING at
 * Meta that fallback is the normal path.
 */
export async function sendSmartPayButton(
  db: Db,
  opts: {
    orgId: string
    phone: string
    accessToken: string
    phoneNumberId: string
    templateType: string
    textBody: string
    /** Body params for the v3 template — NOT the same order as v2. */
    buttonTemplateVars: string[]
    /** Body params for the v2 fallback. */
    templateVars?: string[]
    locale?: string
    namedVars?: Record<string, string>
    chargeId: string
    /** The provider checkout URL, used directly inside the window. */
    paymentUrl: string
    buttonLabel: string
  }
): Promise<void> {
  const {
    orgId,
    phone,
    accessToken,
    phoneNumberId,
    templateType,
    textBody,
    buttonTemplateVars,
    templateVars = [],
    locale = 'he',
    namedVars,
    chargeId,
    paymentUrl,
    buttonLabel,
  } = opts

  const gate = await prepareBusinessSend(db, orgId, phone, accessToken, phoneNumberId, locale)
  if (!gate.ok) {
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

  try {
    if (recent && paymentUrl) {
      await sendCtaUrlMessage(
        phone,
        stripUrlLine(textBody, paymentUrl),
        buttonLabel,
        paymentUrl,
        accessToken,
        phoneNumberId
      )
      return
    }

    if (!recent) {
      // An org that got its own copy approved keeps it — body-only submissions
      // cannot carry a button, and their wording wins over the tap.
      const custom = namedVars
        ? await getApprovedCustomTemplate(db, orgId, templateType, locale)
        : null

      if (!custom) {
        const tmpl = URL_BUTTON_TEMPLATES[locale]?.[templateType] ?? URL_BUTTON_TEMPLATES.he[templateType]
        if (tmpl) {
          await sendTemplateMessage(phone, accessToken, phoneNumberId, tmpl.name, tmpl.languageCode, [
            {
              type: 'body',
              parameters: buttonTemplateVars.map((t) => ({ type: 'text', text: t })),
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: chargeId }],
            },
          ])
          return
        }
      }
    }
  } catch (err) {
    console.warn(
      `[sendSmart] Pay button failed — falling back to the inline link: ${String(err)}`
    )
  }

  await sendSmartMessage(
    db,
    orgId,
    phone,
    accessToken,
    phoneNumberId,
    templateType,
    textBody,
    templateVars,
    locale,
    namedVars
  )
}

/**
 * Drops the line holding nothing but `url`, now that the button carries it.
 * SYNC: mirrors stripUrlLine in src/lib/whatsapp/sendSmart.ts.
 */
function stripUrlLine(body: string, url: string): string {
  const lines = body.split('\n')
  const kept = lines.filter((line) => line.trim() !== url.trim())
  if (kept.length === lines.length) return body
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
