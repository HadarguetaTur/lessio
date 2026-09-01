import type { ChargeType } from '@/lib/charges'

/** Net terms for one-off charges — a lesson, a cancellation fee, a manual line. */
export const DEFAULT_DUE_DAYS = 14

/** Monthly bills fall due on the 10th of the month after the one they cover. */
export const MONTHLY_DUE_DAY = 10

export interface ChargeDueDateInput {
  chargeType: ChargeType
  issuedAt: Date | string
  /** 'YYYY-MM' — required for monthly charges, ignored otherwise. */
  billingMonth?: string | null
  /** Inclusive YYYY-MM-DD end of a non-calendar billing period. */
  periodEnd?: string | null
  /** Organization-specific net terms after periodEnd. */
  dueDays?: number | null
  /** IANA zone, e.g. 'Asia/Jerusalem'. */
  timezone: string
}

/** 'YYYY-MM-DD' for a moment, as read in the given zone. */
function localDate(at: Date, timezone: string): string {
  // 'sv-SE' is the shortest way to an ISO-shaped date out of Intl, and it is
  // the idiom already used elsewhere in the app for day bucketing.
  return at.toLocaleDateString('sv-SE', { timeZone: timezone })
}

/**
 * When a charge falls due.
 *
 * Monthly bills derive their due date from the month they cover, never from
 * when the row happened to be written: `syncMonthlyCharge` recomputes and
 * re-upserts the same charge whenever the month is recalculated, so a
 * creation-relative rule would push an already-overdue March bill further into
 * the future on every recalculation, forever.
 *
 * The date is resolved in the organization's own timezone. `due_date` is a
 * calendar date, and a UTC-based conversion lands on the wrong day for anything
 * created after 21:00 Israel time.
 */
export function resolveChargeDueDate({
  chargeType,
  issuedAt,
  billingMonth,
  periodEnd,
  dueDays,
  timezone,
}: ChargeDueDateInput): string {
  if (chargeType === 'monthly' && periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    const [year, month, day] = periodEnd.split('-').map(Number)
    const due = new Date(Date.UTC(year, month - 1, day + (dueDays ?? 7)))
    return due.toISOString().slice(0, 10)
  }
  if (chargeType === 'monthly' && billingMonth && /^\d{4}-\d{2}$/.test(billingMonth)) {
    const [year, month] = billingMonth.split('-').map(Number)
    // Month is 1-based here and 0-based in Date, so `month` already points at
    // the month after the billed one.
    const due = new Date(Date.UTC(year, month, MONTHLY_DUE_DAY))
    return due.toISOString().slice(0, 10)
  }

  const at = typeof issuedAt === 'string' ? new Date(issuedAt) : issuedAt
  const [y, m, d] = localDate(at, timezone).split('-').map(Number)
  const due = new Date(Date.UTC(y, m - 1, d + DEFAULT_DUE_DAYS))
  return due.toISOString().slice(0, 10)
}
