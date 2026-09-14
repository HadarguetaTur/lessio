/**
 * Phone number normalization to E.164 format.
 * All phone numbers stored and queried in the DB must pass through this function.
 * Per /docs/decisions.md #8 and /docs/schema.md § Phone Normalization.
 *
 * Rules:
 *   05XXXXXXXX    → +9725XXXXXXXX
 *   9725XXXXXXXX  → +9725XXXXXXXX
 *   +9725XXXXXXXX → unchanged
 *   Anything else → throws PhoneNormalizationError
 */

export class PhoneNormalizationError extends Error {
  constructor(phone: string) {
    // The rejected number is deliberately not in the message: this error is
    // routinely logged as part of an `{ err }` payload, which would put a
    // subscriber's phone number into the platform logs by the back door.
    // The length is enough to tell "empty field" from "wrong format".
    super(`Cannot normalize phone number to E.164 (${phone.trim().length} characters)`)
    this.name = 'PhoneNormalizationError'
  }
}

export function normalizePhone(phone: string): string {
  const raw = phone.trim()

  // Strip formatting characters (spaces, dashes, parentheses, dots)
  // but preserve a leading '+' for E.164 numbers
  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/[^0-9]/g, '')
  const cleaned = hasPlus ? `+${digits}` : digits

  // Already E.164: +972 + 5 + 8 digits = 13 chars
  if (/^\+9725\d{8}$/.test(cleaned)) {
    return cleaned
  }

  // 05XXXXXXXX: 0 + 5 + 8 digits = 10 chars → +9725XXXXXXXX
  if (/^05\d{8}$/.test(cleaned)) {
    return `+972${cleaned.slice(1)}`
  }

  // 9725XXXXXXXX: 972 + 5 + 8 digits = 12 chars → +9725XXXXXXXX
  if (/^9725\d{8}$/.test(cleaned)) {
    return `+${cleaned}`
  }

  throw new PhoneNormalizationError(raw)
}

/**
 * Normalizes a number that arrived from Meta, rather than one a user typed.
 *
 * `normalizePhone` encodes a deliberate business rule — Lessio's own contact
 * fields accept Israeli mobiles and nothing else — and that rule is right for
 * a form. Applied to the WhatsApp webhook it was a bug: an inbound message from
 * a foreign number, an Israeli landline, or a Meta reviewer's US handset was
 * dropped before the org was even resolved, so it produced no reply, no lead
 * and no transcript row. The English-language tenant, whose parents are not all
 * on +9725 numbers, simply never heard from half of them.
 *
 * Israeli numbers keep their existing normalisation exactly — that is what
 * parent identity is stored as (`parents` is unique on organization_id, phone),
 * so this widens what we ACCEPT without changing what any existing row means.
 * Everything else becomes plain E.164: a leading '+' and 8–15 digits.
 *
 * A local-format number with a leading zero is still rejected: '0' is not a
 * country code, and Meta never sends one — accepting it would invent a country.
 */
export function normalizeInboundPhone(phone: string): string {
  try {
    return normalizePhone(phone)
  } catch {
    // Not an Israeli mobile. Fall through to generic E.164.
  }

  const digits = phone.trim().replace(/[^0-9]/g, '')
  if (digits.startsWith('0') || digits.length < 8 || digits.length > 15) {
    throw new PhoneNormalizationError(phone)
  }
  return `+${digits}`
}

/**
 * A phone number reduced to what a log line legitimately needs.
 *
 * A subscriber's phone is personal data, and the WhatsApp webhook logs on
 * essentially every inbound message — so the raw number was accumulating in
 * platform logs at volume. The masked form keeps what makes a log useful
 * (correlating lines about one conversation, eyeballing the country/prefix)
 * without retaining the identifier itself: `+9725••••1234`.
 *
 * Deliberately total — it accepts anything, including null and malformed
 * input, because a redaction helper that throws would just push callers back
 * to logging the raw value.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '(none)'
  const trimmed = phone.trim()
  if (trimmed.length < 4) return '••••'

  const digits = trimmed.replace(/[^0-9]/g, '')
  const last4 = digits.slice(-4)

  // Canonical Israeli mobile: keep the country code and the leading 5.
  if (/^\+9725\d{8}$/.test(trimmed)) return `+9725••••${last4}`

  // Anything else (foreign, unnormalized, malformed) keeps only the tail, so an
  // unexpected shape cannot leak more than a canonical one.
  return `••••${last4}`
}

/**
 * E.164 → the local Israeli form (05XXXXXXXX) that some providers insist on.
 * Grow rejects a payer phone in any other shape.
 * Returns null when the number cannot be expressed that way, so callers can
 * simply omit the field rather than send something the provider will reject.
 */
export function toIsraeliLocalPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  try {
    return `0${normalizePhone(phone).slice(4)}`
  } catch {
    return null
  }
}
