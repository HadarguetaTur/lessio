/**
 * Sends a template-driven message whose payload is a link, as a tappable CTA
 * button rather than a raw URL in the body.
 *
 * WhatsApp text messages have no hyperlink markup — a URL in the body is always
 * rendered in full, which for a signed booking JWT is a wall of characters.
 * The interactive `cta_url` message type solves this: short button label, hidden
 * URL. It is a free-form message, so it is only valid inside the 24h
 * customer-service window — every caller is replying to an inbound parent
 * message, so the window is open by construction.
 *
 * Falls back to the plain-text form (URL inline) whenever the button form is not
 * safe or not accepted:
 *   - the org customised the template so the URL sits mid-sentence
 *   - the body exceeds Meta's 1024-char interactive limit
 *   - Meta rejects the interactive send for any reason
 * The parent always gets the link either way.
 */

import type { AppLocale } from '@/lib/i18n/locale'
import { type BotStringKey } from './strings'
import { getOrgBotStrings, resolveBotString } from './orgStrings'
import {
  resolveTemplate,
  substituteVars,
  stripStandaloneVarLine,
  DEFAULT_TEMPLATES,
  type MessageTemplateType,
} from './templates'
import { sendCtaUrlMessage, sendTextMessage, CTA_BODY_MAX } from './index'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface SendLinkReplyParams {
  orgId: string
  to: string
  templateType: MessageTemplateType
  /** Template variable holding the URL, e.g. 'booking_url'. */
  urlVar: string
  url: string
  /** Bot-string key for the button label (≤ 20 chars in both languages). */
  buttonKey: BotStringKey
  locale: AppLocale
  accessToken: string
  phoneNumberId: string
  /** Any other template variables besides the URL. */
  vars?: Record<string, string>
}

/**
 * Loads the raw template string (custom row, else system default) using the same
 * fallback chain as resolveTemplate, but WITHOUT substituting — the caller needs
 * the unsubstituted form to locate the URL placeholder line.
 */
async function loadRawTemplate(
  orgId: string,
  type: MessageTemplateType,
  locale: AppLocale
): Promise<string> {
  const fallback = DEFAULT_TEMPLATES[locale]?.[type] ?? DEFAULT_TEMPLATES.he[type]

  try {
    const db = createServiceRoleClient()
    const { data } = await db
      .from('message_templates')
      .select('body_template, locale')
      .eq('organization_id', orgId)
      .eq('type', type)
      .in('locale', locale === 'he' ? ['he'] : [locale, 'he'])

    const rows = (data ?? []) as Array<{ body_template: string; locale: string }>
    const custom =
      rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'he')

    if (custom?.body_template) return custom.body_template
  } catch (err) {
    console.error('[whatsapp/sendLinkReply] template load failed — using default', {
      orgId,
      type,
      locale,
      err,
    })
  }

  return fallback
}

export async function sendLinkReply(params: SendLinkReplyParams): Promise<void> {
  const {
    orgId,
    to,
    templateType,
    urlVar,
    url,
    buttonKey,
    locale,
    accessToken,
    phoneNumberId,
    vars = {},
  } = params

  const allVars = { ...vars, [urlVar]: url }

  const raw = await loadRawTemplate(orgId, templateType, locale)
  const bodyWithoutUrl = stripStandaloneVarLine(raw, urlVar)

  if (bodyWithoutUrl !== null) {
    const ctaBody = substituteVars(bodyWithoutUrl, allVars)
    if (ctaBody.length > 0 && ctaBody.length <= CTA_BODY_MAX) {
      try {
        // The org's own label where it set one — this is the button an owner
        // edits on the settings page.
        const overrides = await getOrgBotStrings(orgId, locale)
        await sendCtaUrlMessage(
          to,
          ctaBody,
          resolveBotString(overrides, buttonKey, locale),
          url,
          accessToken,
          phoneNumberId
        )
        return
      } catch (err) {
        console.error('[whatsapp/sendLinkReply] CTA send failed — falling back to text', {
          orgId,
          templateType,
          err,
        })
      }
    }
  }

  // Plain-text fallback. Re-resolve rather than reusing `raw`, so a DB blip
  // between the two reads still yields a valid, fully substituted body.
  const textBody = await resolveTemplate(orgId, templateType, allVars, locale)
  await sendTextMessage(to, textBody, accessToken, phoneNumberId)
}
