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
    super(`Cannot normalize phone number to E.164: "${phone}"`)
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
