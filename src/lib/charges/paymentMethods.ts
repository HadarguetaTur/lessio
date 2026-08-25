/**
 * Pure payment-side types and math, split out from `payments.ts` so client
 * components can import them: `payments.ts` reaches the database, which pulls
 * the server-only Supabase client into any bundle that touches it.
 */

export type PaymentMethod = 'manual' | 'cash' | 'bank_transfer' | 'provider' | 'other'

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'manual',
  'cash',
  'bank_transfer',
  'provider',
  'other',
] as const

export interface ChargePayment {
  id: string
  amount: number
  method: PaymentMethod
  paidAt: string
  notes: string | null
  recordedBy: string | null
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Amount still owed on a charge. The single definition every debt surface
 * should go through, so partial payments cannot be forgotten in one of them.
 */
export function remainingAmount(amount: number, amountPaid: number | null | undefined): number {
  return round2(Math.max(0, Number(amount) - Number(amountPaid ?? 0)))
}
