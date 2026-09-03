/**
 * Session-window aware WhatsApp message sender.
 * Per /docs/sprint-23-scope.md § Story 4b.
 *
 * Algorithm:
 *   1. Check whatsapp_processed_messages for a row from `phone` in `orgId`
 *      within the last 24 hours.
 *   2. Within window  → sendTextMessage (customisable org template body)
 *   3. Outside window → sendTemplateMessage (Meta-approved template), preferring
 *      one the org authored and got approved itself over Lessio's built-in copy.
 *
 * Falls back to sendTextMessage if no approved template is registered for
 * the given templateType (fail-safe — still sends something).
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AppLocale } from '@/lib/i18n/locale'
import {
  resolveTemplate,
  loadRawTemplate,
  substituteVars,
  stripStandaloneVarLine,
  withDeclaredDefaults,
  type MessageTemplateType,
} from './templates'
import { sendTextMessage, sendTemplateMessage, sendCtaUrlMessage, CTA_BODY_MAX } from './index'
import {
  getApprovedTemplate,
  param,
  metaAmountParam,
  URL_BUTTON_TEMPLATES,
  URL_BUTTON_TEMPLATES_V4,
} from './approvedTemplates'
import { getApprovedCustomTemplate, isTemplateApproved } from './templateStatus'
import { buildCustomComponents } from './submitTemplate'
import { prepareBusinessSend } from './consent'
import { botString } from './strings'
import { getWaLogContext, runWithWaLogContext } from './logContext'

/**
 * Files a business-initiated send under the conversation it belongs to.
 *
 * Every caller here is proactive — a reminder, a payment request, a dunning
 * notice — so 'cron' is the right label for anything that has not already
 * declared itself. A caller that has (the dashboard's manual send, the webhook)
 * keeps its own context: this only fills the gap.
 */
function withSendLogContext<T>(orgId: string, phone: string, fn: () => T): T {
  if (getWaLogContext()) return fn()
  return runWithWaLogContext({ orgId, phone, origin: 'cron' }, fn)
}

/** Why a send did not happen. `sent: true` means it was handed to Meta. */
export type SmartSendResult = { sent: true } | { sent: false; reason: 'opted_out' }

/**
 * Sends a WhatsApp message using the correct method based on whether the
 * 24h customer-service window is open.
 *
 * Every caller is business-initiated (reminders, notifications, dashboard
 * buttons), so this is the enforcement point for opt-out and for the one-time
 * welcome notice (src/lib/whatsapp/consent.ts). Direct replies to an inbound
 * message do not come through here and are never blocked.
 */
export async function sendSmartMessage(params: {
  orgId: string
  phone: string
  accessToken: string
  phoneNumberId: string
  templateType: MessageTemplateType
  vars: Record<string, string>
  locale?: AppLocale
}): Promise<SmartSendResult> {
  return withSendLogContext(params.orgId, params.phone, () => smartSend(params))
}

async function smartSend(params: {
  orgId: string
  phone: string
  accessToken: string
  phoneNumberId: string
  templateType: MessageTemplateType
  vars: Record<string, string>
  locale?: AppLocale
}): Promise<SmartSendResult> {
  const { orgId, phone, accessToken, phoneNumberId, templateType, vars, locale = 'he' } = params

  const gate = await prepareBusinessSend({ orgId, phone, accessToken, phoneNumberId, locale })
  if (!gate.ok) {
    console.info('[sendSmart] Recipient opted out — not sending', { orgId, templateType })
    return { sent: false, reason: gate.reason }
  }

  const inWindow = await isInSessionWindow(orgId, phone)

  if (inWindow) {
    // Within 24h window — send customisable text message
    const body = await resolveTemplate(orgId, templateType, vars, locale)
    await sendTextMessage(phone, body, accessToken, phoneNumberId)
    return { sent: true }
  }

  // Outside window — a template the org wrote itself and got approved wins, so
  // what a parent receives out of window is the copy the owner edited in
  // settings rather than Lessio's stock wording.
  //
  // Only an exact language match counts: an org that approved Hebrew copy but
  // not English should still get the built-in English template below, not
  // Hebrew. The lookup never throws — on failure it returns null and we fall
  // through to the built-in chain.
  const custom = await getApprovedCustomTemplate(orgId, templateType, locale)

  if (custom) {
    await sendTemplateMessage(
      phone,
      accessToken,
      phoneNumberId,
      custom.name,
      custom.language,
      buildCustomComponents(custom.varOrder, vars, locale)
    )
    return { sent: true }
  }

  // Use the built-in approved template in the recipient's language, falling back
  // to the Hebrew one. Falling back to TEXT here would fail with error 131047,
  // so an approved template in the wrong language still beats it.
  const approved = getApprovedTemplate(templateType, locale) ?? getApprovedTemplate(templateType, 'he')

  if (approved) {
    const components = approved.buildComponents(vars)
    await sendTemplateMessage(phone, accessToken, phoneNumberId, approved.name, approved.languageCode, components)
    return { sent: true }
  }

  // Fallback: no approved template registered — send text anyway
  // This may fail if the session window is truly closed, but ensures
  // the message is at least attempted.
  console.warn('[sendSmart] No approved template for type — falling back to text', {
    orgId,
    templateType,
  })
  const body = await resolveTemplate(orgId, templateType, vars, locale)
  await sendTextMessage(phone, body, accessToken, phoneNumberId)
  return { sent: true }
}

/**
 * Sends a payment message whose link is a button rather than a bare URL in the
 * body.
 *
 * The two halves of the 24h window need different mechanics for the same
 * result:
 *
 *   Inside  — a free-form cta_url message, so the button can point straight at
 *             the provider's own checkout URL.
 *   Outside — the v3 template, whose URL button is a FIXED base plus a dynamic
 *             suffix. Meta will not accept an arbitrary URL as a parameter, so
 *             the suffix is the charge id and /pay/<id> resolves it (see
 *             src/app/pay/[chargeId]/route.ts).
 *
 * Anything failing falls back to `sendSmartMessage`, i.e. the v2 text/template
 * with the link inline. The link reaching the parent matters more than how it
 * is dressed, and while the v3 templates are PENDING at Meta that fallback is
 * the normal path, not an error case.
 */
export async function sendPaymentWithButton(params: {
  orgId: string
  phone: string
  accessToken: string
  phoneNumberId: string
  templateType: Extract<MessageTemplateType, 'payment_request' | 'payment_reminder'>
  /** Everything the body needs, including `payment_link` for the text fallback. */
  vars: Record<string, string>
  /** The charge the button resolves through. */
  chargeId: string
  /** The provider checkout URL, used directly inside the window. */
  paymentUrl: string
  locale?: AppLocale
}): Promise<SmartSendResult> {
  return withSendLogContext(params.orgId, params.phone, () => payWithButton(params))
}

async function payWithButton(params: {
  orgId: string
  phone: string
  accessToken: string
  phoneNumberId: string
  templateType: Extract<MessageTemplateType, 'payment_request' | 'payment_reminder'>
  vars: Record<string, string>
  chargeId: string
  paymentUrl: string
  locale?: AppLocale
}): Promise<SmartSendResult> {
  const {
    orgId,
    phone,
    accessToken,
    phoneNumberId,
    templateType,
    vars,
    chargeId,
    paymentUrl,
    locale = 'he',
  } = params

  const gate = await prepareBusinessSend({ orgId, phone, accessToken, phoneNumberId, locale })
  if (!gate.ok) {
    console.info('[sendSmart] Recipient opted out — not sending', { orgId, templateType })
    return { sent: false, reason: gate.reason }
  }

  try {
    if (await isInSessionWindow(orgId, phone)) {
      // The RAW body — stripping matches on `{{payment_link}}`, which no longer
      // exists once resolveTemplate has substituted the URL in. Getting this
      // order wrong is why parents received the link twice: once as text and
      // once as the button.
      const raw = await loadRawTemplate(orgId, templateType, locale)
      const stripped = stripStandaloneVarLine(raw, 'payment_link')
      const body =
        stripped === null ? null : substituteVars(stripped, withDeclaredDefaults(templateType, vars))

      // null means the org wrote the link mid-sentence, so the line cannot be
      // lifted without mangling their copy — same contract sendLinkReply
      // honours. Falling through to sendSmartMessage keeps the link inline and
      // drops the button, rather than sending both.
      if (body !== null && body.length > 0 && body.length <= CTA_BODY_MAX) {
        await sendCtaUrlMessage(
          phone,
          body,
          botString('cta_pay_now', locale),
          paymentUrl,
          accessToken,
          phoneNumberId
        )
        return { sent: true }
      }

      return sendSmartMessage({
        orgId,
        phone,
        accessToken,
        phoneNumberId,
        templateType,
        vars,
        locale,
      })
    }

    // An org that authored and got its own copy approved keeps that copy — a
    // body-only submission cannot carry a button, and their wording wins.
    const custom = await getApprovedCustomTemplate(orgId, templateType, locale)
    if (!custom) {
      // v4 carries no '₪' of its own and therefore takes the formatted amount;
      // v3's approved copy prints the symbol and takes the bare figure. The
      // template and its parameters must be chosen together or the parent reads
      // '₪₪250.00'. v4 is used only once Meta has approved it for this org, so
      // this is a no-op until then.
      const v4 = URL_BUTTON_TEMPLATES_V4[templateType]?.[locale]
      const useV4 = v4 ? await isTemplateApproved(orgId, v4.name, v4.languageCode) : false

      const tmpl = useV4 ? v4 : URL_BUTTON_TEMPLATES[templateType]?.[locale]
      const bodyParams = buildPayBodyParams(templateType, locale, vars, useV4)

      if (tmpl && bodyParams) {
        await sendTemplateMessage(phone, accessToken, phoneNumberId, tmpl.name, tmpl.languageCode, [
          { type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) },
          {
            type: 'button',
            sub_type: 'url',
            index: 0,
            parameters: [{ type: 'text', text: chargeId }],
          },
        ])
        return { sent: true }
      }
    }
  } catch (err) {
    console.warn('[sendSmart] Pay button failed — falling back to the inline link', {
      orgId,
      templateType,
      err,
    })
  }

  return sendSmartMessage({
    orgId,
    phone,
    accessToken,
    phoneNumberId,
    templateType,
    vars,
    locale,
  })
}

/**
 * Body parameters for the v3 payment templates.
 *
 * These do NOT match the v2 parameter order: dropping the link line from the
 * body dropped a parameter with it, so payment_request takes the amount alone
 * where v2 took amount + link.
 */
function buildPayBodyParams(
  templateType: 'payment_request' | 'payment_reminder',
  locale: AppLocale,
  vars: Record<string, string>,
  /** v4 prints no currency symbol, so it takes the formatted amount instead. */
  formattedAmount = false
): string[] | null {
  const amount = formattedAmount
    ? param(vars.amount, '0').text
    : metaAmountParam(vars).text

  if (templateType === 'payment_request') {
    return [amount]
  }
  return [param(vars.parent_name, locale === 'en' ? 'there' : 'הורים יקרים').text, amount]
}

/**
 * Returns true if there is a recorded inbound message from `phone` in `orgId`
 * within the last 24 hours (Meta customer-service window is open).
 */
export async function isInSessionWindow(orgId: string, phone: string): Promise<boolean> {
  const db = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('whatsapp_processed_messages')
    .select('message_id')
    .eq('organization_id', orgId)
    .eq('phone', phone)
    .gt('created_at', cutoff)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('[sendSmart] Session window check failed — assuming closed', {
      orgId,
      error: error.message,
    })
    return false
  }

  return data !== null
}
