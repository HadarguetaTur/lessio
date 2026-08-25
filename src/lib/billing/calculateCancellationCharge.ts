import type { CancellationPolicy } from '@/lib/cancellation-policy'

export interface LessonForCancellation {
  start_at: string // ISO UTC timestamptz
  end_at: string // ISO UTC timestamptz
  /**
   * What one student owes for this lesson at full price, from
   * resolveLessonBaseAmount — hourly rate × duration for individual lessons,
   * the per-student price for pair/group/custom. Null when it cannot be priced.
   */
  baseAmount: number | null
}

export interface CancellationChargeResult {
  shouldCharge: boolean
  chargeType: 'full' | 'partial' | null
  amount: number
  reasonCode: string
}

/**
 * Pure function — no DB access, no side effects.
 * Determines whether a cancellation incurs a charge and how much.
 *
 * Boundary rules (from DEV-55):
 *   hoursLeft > notice_hours_full          → no charge
 *   notice_hours_partial ≤ hoursLeft ≤ notice_hours_full → partial charge
 *   hoursLeft < notice_hours_partial        → full charge
 *
 * All time math is done in UTC (milliseconds), so timezone offsets cannot
 * cause a cancellation at e.g. 00:30 local time to be misclassified.
 */
export function calculateCancellationCharge(
  lesson: LessonForCancellation,
  cancelledAt: Date | string,
  policy: CancellationPolicy | null
): CancellationChargeResult {
  if (!policy) {
    return { shouldCharge: false, chargeType: null, amount: 0, reasonCode: 'no_policy' }
  }

  const cancelledAtMs =
    cancelledAt instanceof Date ? cancelledAt.getTime() : new Date(cancelledAt).getTime()
  const startAtMs = new Date(lesson.start_at).getTime()

  const hoursLeft = (startAtMs - cancelledAtMs) / (1000 * 60 * 60)

  const { notice_hours_full, notice_hours_partial, partial_charge_percent } = policy

  if (hoursLeft > notice_hours_full) {
    return { shouldCharge: false, chargeType: null, amount: 0, reasonCode: 'outside_window' }
  }

  const fullLessonAmount = lesson.baseAmount ?? 0

  const missingRate = lesson.baseAmount == null

  if (hoursLeft < notice_hours_partial) {
    // Full charge
    return {
      shouldCharge: true,
      chargeType: 'full',
      amount: missingRate ? 0 : fullLessonAmount,
      reasonCode: missingRate ? 'missing_rate' : 'full_charge',
    }
  }

  // notice_hours_partial ≤ hoursLeft ≤ notice_hours_full → partial charge
  const partialAmount = missingRate
    ? 0
    : round2(fullLessonAmount * (partial_charge_percent / 100))

  return {
    shouldCharge: true,
    chargeType: 'partial',
    amount: partialAmount,
    reasonCode: missingRate ? 'missing_rate' : 'partial_charge',
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
