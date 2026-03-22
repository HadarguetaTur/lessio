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
  const digits = phone.trim()

  // Already E.164: +972 + 5 + 8 digits = 13 chars
  if (/^\+9725\d{8}$/.test(digits)) {
    return digits
  }

  // 05XXXXXXXX: 0 + 5 + 8 digits = 10 chars → +9725XXXXXXXX
  if (/^05\d{8}$/.test(digits)) {
    return `+972${digits.slice(1)}`
  }

  // 9725XXXXXXXX: 972 + 5 + 8 digits = 12 chars → +9725XXXXXXXX
  if (/^9725\d{8}$/.test(digits)) {
    return `+${digits}`
  }

  throw new PhoneNormalizationError(digits)
}
