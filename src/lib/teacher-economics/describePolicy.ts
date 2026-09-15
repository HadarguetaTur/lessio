import type { CompensationPolicy } from './calculator'

type Translate = (key: string, values?: Record<string, string | number>) => string

/** "Hourly ₪120 · no-show 50%" — the rule this line was priced under, from the frozen snapshot. */
export function describePolicy(
  policy: CompensationPolicy | null,
  t: Translate,
  money: (value: number) => string
): string {
  if (!policy) return t('policy.none')
  const rate = (() => {
    switch (policy.model) {
      case 'hourly': return t('policy.hourly', { amount: money(policy.hourlyAmount ?? 0) })
      case 'fixed_per_lesson': return t('policy.fixed', { amount: money(policy.fixedAmount ?? 0) })
      case 'percentage_revenue': return t('policy.percentage', { percent: policy.revenuePercent ?? 0 })
      case 'base_plus_participant': {
        const base = policy.baseRateType === 'hourly'
          ? t('policy.hourly', { amount: money(policy.hourlyAmount ?? 0) })
          : t('policy.fixed', { amount: money(policy.fixedAmount ?? 0) })
        return t('policy.basePlus', { base, amount: money(policy.participantAmount ?? 0) })
      }
    }
  })()
  return rate
}
