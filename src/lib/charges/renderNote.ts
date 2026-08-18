/**
 * Charge notes are written once and read much later — potentially by a
 * different user, in a different language — so the generated ones are stored as
 * a stable code rather than display copy, and resolved at render time.
 *
 * Anything that is not a recognised code is passed through untouched: free-text
 * notes typed by a user, and rows written before this became a code.
 */

/** `MONTHLY_CHARGE:2026-04` — written by syncMonthlyCharge. */
const MONTHLY_CHARGE = /^MONTHLY_CHARGE:(\d{4}-\d{2})$/

export function monthlyChargeNote(billingMonth: string): string {
  return `MONTHLY_CHARGE:${billingMonth}`
}

export function renderChargeNote(
  notes: string | null | undefined,
  t: (key: string, values?: Record<string, string | number | Date>) => string
): string | null {
  if (!notes) return null
  const monthly = notes.match(MONTHLY_CHARGE)
  if (monthly) return t('charges.monthlyChargeNote', { month: monthly[1] })
  return notes
}
