/**
 * Registers a connected phone number with WhatsApp Cloud API.
 *
 * Embedded Signup gets a number onto a WABA; it does not put that number on
 * Cloud API. Until POST /{PHONE_NUMBER_ID}/register runs, every send fails —
 * the org reads as connected and cannot message anyone. That is the same
 * failure mode the WABA webhook subscription guards against, so this call is
 * treated the same way: it must succeed before the connection is persisted.
 *
 * The PIN is the number's two-step verification PIN, and it is platform-level
 * (WHATSAPP_REGISTER_PIN) rather than per-org: orgs never see it, and
 * re-registering a number later needs the same value back.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/registration
 */

import { META_API_VERSION } from './graphVersion'

export class PhoneRegistrationError extends Error {}

/** Meta accepts a 6-digit PIN and nothing else. */
export function isValidRegisterPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

/**
 * Registers the number on Cloud API. Re-registering an already registered
 * number succeeds, so this is safe to re-run when a signup is retried.
 * Throws PhoneRegistrationError with Meta's own message on any failure.
 */
export async function registerPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  pin: string
): Promise<void> {
  if (!isValidRegisterPin(pin)) {
    throw new PhoneRegistrationError('WHATSAPP_REGISTER_PIN must be exactly 6 digits')
  }

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/register`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    }
  )

  if (!res.ok) {
    // Meta's message is the only thing that says *why* — a PIN mismatch, an
    // unverified number and a number already on another app all land here.
    const body = await res.text().catch(() => '')
    throw new PhoneRegistrationError(
      `register failed for phone_number_id ${phoneNumberId}: ${res.status} ${body}`
    )
  }
}
