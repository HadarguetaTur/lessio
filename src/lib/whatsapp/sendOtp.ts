/**
 * Portal OTP sender — Meta AUTHENTICATION template with text fallback.
 * Per /docs/sprint-31-scope.md § Story 3.
 *
 * OTP login is exactly the cold-start case: a parent logging into the portal
 * for the first time has usually never messaged the org's WhatsApp number, so
 * the 24h session window is closed and a plain text send fails (error 131047).
 * AUTHENTICATION templates are the only Meta-sanctioned way to deliver codes
 * outside the window, and are preferred even inside it for consistency.
 *
 * Not routed through sendSmartMessage: auth templates have a fixed
 * Meta-generated body and a dual body+button parameter shape (the code goes in
 * both) that does not fit the MessageTemplateType vars model.
 *
 * Fallback: if the template send fails (e.g. not yet approved on this WABA —
 * error 132001), falls back to the legacy plain-text message so in-window
 * logins keep working during rollout.
 */

import { sendTemplateMessage, sendTextMessage, type MetaTemplateComponent } from './index'
import { botString } from './strings'
import type { AppLocale } from '@/lib/i18n/locale'

/** Registered by registerTemplatesForWABA — see registerTemplates.ts. */
export const OTP_TEMPLATE_NAME = 'lessio_otp_he'
export const OTP_TEMPLATE_LANGUAGE = 'he'

const OTP_TEMPLATES: Record<AppLocale, { name: string; language: string }> = {
  he: { name: 'lessio_otp_he', language: 'he' },
  en: { name: 'lessio_otp_en', language: 'en' },
}

export async function sendOtp(
  phone: string,
  otp: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale = 'he'
): Promise<void> {
  // Meta auth-template send shape: the code is passed twice — once as the body
  // parameter and once as the copy-code button parameter (addressed sub_type 'url').
  const components: MetaTemplateComponent[] = [
    { type: 'body', parameters: [{ type: 'text', text: otp }] },
    { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: otp }] },
  ]

  const template = OTP_TEMPLATES[locale] ?? OTP_TEMPLATES.he

  try {
    await sendTemplateMessage(
      phone,
      accessToken,
      phoneNumberId,
      template.name,
      template.language,
      components
    )
    return
  } catch (err) {
    console.warn('[sendOtp] Auth template send failed — falling back to text', {
      phoneNumberId,
      locale,
      error: String(err),
    })
  }

  await sendTextMessage(
    phone,
    botString('otp_fallback', locale, { otp }),
    accessToken,
    phoneNumberId
  )
}
