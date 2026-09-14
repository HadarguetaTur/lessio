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

/**
 * Why Meta refused to register the number.
 *
 * The one that matters is `pin_required`. Registration sends Lessio's own
 * platform PIN, which works on a number that has no two-step verification of
 * its own — but a customer who already switched two-step verification on in the
 * WhatsApp app has a PIN we cannot know, and Meta rejects ours. Retrying sends
 * the same platform PIN and fails forever, so "please try connecting again" is
 * the one instruction guaranteed not to work. The owner has to turn two-step
 * verification off on that number first.
 */
export type RegistrationFailureKind =
  | 'pin_required'
  | 'pin_locked'
  | 'reverification_required'
  | 'unknown'

export class PhoneRegistrationError extends Error {
  constructor(
    message: string,
    /** What the customer has to do about it. */
    public readonly kind: RegistrationFailureKind = 'unknown',
    /** Meta's own sentence, for the owner to read. Empty when it sent none. */
    public readonly metaMessage: string = ''
  ) {
    super(message)
    this.name = 'PhoneRegistrationError'
  }
}

/** Meta error codes on POST /{phone}/register. */
const PIN_MISMATCH = 133005
const PIN_LOCKED = 133016
const REVERIFICATION = 133006

/**
 * Turns a Graph error body into something a studio owner can act on.
 *
 * Meta's own text is carried through rather than replaced: it names the actual
 * obstacle, and it was previously only ever written to console.error while the
 * owner was told to retry (UX audit F13).
 */
export function classifyRegistrationFailure(body: string): {
  kind: RegistrationFailureKind
  metaMessage: string
} {
  let code: number | undefined
  let metaMessage = ''
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        code?: number
        message?: string
        error_user_title?: string
        error_user_msg?: string
      }
    }
    code = parsed.error?.code
    // error_user_msg is Meta's customer-facing wording; message is the
    // developer one. Prefer the former, fall back to the latter.
    metaMessage = parsed.error?.error_user_msg ?? parsed.error?.message ?? ''
  } catch {
    // Not JSON. Meta occasionally returns an HTML error page — that text is
    // not worth showing anyone, so it stays out of metaMessage.
  }

  if (code === PIN_MISMATCH) return { kind: 'pin_required', metaMessage }
  if (code === PIN_LOCKED) return { kind: 'pin_locked', metaMessage }
  if (code === REVERIFICATION) return { kind: 'reverification_required', metaMessage }
  return { kind: 'unknown', metaMessage }
}

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
    const { kind, metaMessage } = classifyRegistrationFailure(body)
    throw new PhoneRegistrationError(
      `register failed for phone_number_id ${phoneNumberId}: ${res.status} ${body}`,
      kind,
      metaMessage
    )
  }
}
