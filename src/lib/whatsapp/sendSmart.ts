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
  stripStandaloneVarLine,
  type MessageTemplateType,
} from './templates'
import { sendTextMessage, sendTemplateMessage, sendCtaUrlMessage } from './index'
import { getApprovedTemplate, param, URL_BUTTON_TEMPLATES } from './approvedTemplates'
import { getApprovedCustomTemplate } from './templateStatus'
import { buildCustomComponents } from './submitTemplate'
import { prepareBusinessSend } from './consent'
import { botString } from './strings'

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
  /** Everything the v2 body needs, including `payment_link` for the fallback. */
  vars: Record<string, string>
  /**
   * The in-window body, when the caller composes its own — the consolidated
   * payment request lists every charge and is not a template lookup. Omitted,
   * the org's template for this type is resolved as usual.
   */
  body?: string
  /** The charge the button resolves through. */
  chargeId: string
  /** The provider checkout URL, used directly inside the window. */
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
      // The body minus the line that held the raw link — that line is what the
      // button replaces. A caller-supplied body already has the URL substituted
      // in, so it is matched literally; a resolved template still has the
      // placeholder.
      const body = params.body
        ? stripUrlLine(params.body, paymentUrl)
        : await resolveTemplate(orgId, templateType, vars, locale).then(
            (full) => stripStandaloneVarLine(full, 'payment_link') ?? full
          )

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

    // An org that authored and got its own copy approved keeps that copy — a
    // body-only submission cannot carry a button, and their wording wins.
    const custom = await getApprovedCustomTemplate(orgId, templateType, locale)
    if (!custom) {
      const tmpl = URL_BUTTON_TEMPLATES[templateType]?.[locale]
      const bodyParams = buildPayBodyParams(templateType, locale, vars)

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
 * Drops the line holding nothing but `url` from an already-composed body.
 *
 * The button carries the link now, and leaving it in the text as well reads as
 * a duplicate. Only a line that is exactly the URL is removed: a link written
 * mid-sentence is part of the copy, and cutting the sentence around it would be
 * worse than the duplication.
 */
function stripUrlLine(body: string, url: string): string {
  const lines = body.split('\n')
  const kept = lines.filter((line) => line.trim() !== url.trim())
  if (kept.length === lines.length) return body
  // Collapse the blank gap the removed line may have left behind.
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
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
  vars: Record<string, string>
): string[] | null {
  if (templateType === 'payment_request') {
    return [param(vars.amount, '0').text]
  }
  return [
    param(vars.parent_name, locale === 'en' ? 'there' : 'הורים יקרים').text,
    param(vars.amount, '0').text,
  ]
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
