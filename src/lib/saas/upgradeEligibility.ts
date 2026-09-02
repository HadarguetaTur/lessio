import type { SaasPlanRow } from './plans'
import type { OrgQuotaUsage, QuotaKind } from './quota'

export type UpgradeRejection = 'NOT_AN_UPGRADE' | 'USAGE_EXCEEDS_TARGET'

export type UpgradeVerdict =
  | { ok: true }
  | { ok: false; reason: UpgradeRejection; dimension?: QuotaKind }

/**
 * Whether an org may move to `target`.
 *
 * This used to live in two places — `assertUpgradeAllowed` in the checkout
 * action and a hand-written filter on the billing page — which meant the page
 * could offer a card the action then refused. One predicate, one test file.
 *
 * Two independent guards:
 *
 * 1. **The value ladder.** `sort_order` is assigned by price, retired tiers
 *    interleaved (basic 5 · solo 10 · advanced 15 · studio 20 · center 30), so
 *    a legacy ₪199 customer cannot "upgrade" down to the ₪149 tier while a
 *    legacy ₪99 customer can move up to it. No legacy special-casing needed.
 *
 * 2. **Usage must fit.** Deliberately compares the org's ACTUAL usage against
 *    the target's limits, not the current plan's limits against the target's.
 *    Every retired tier carries NULL (unlimited) quotas, so a limit-vs-limit
 *    comparison would leave a one-teacher legacy customer unable to reach
 *    anything but the top tier. Usage-vs-limit answers correctly in every case,
 *    and it is also what stops an eight-teacher org from buying a five-seat
 *    plan and locking itself out on Monday morning.
 */
export function evaluateUpgrade(args: {
  /** null = grandfathered org with no subscription row; the ladder does not apply. */
  current: SaasPlanRow | null
  target: SaasPlanRow
  usage: OrgQuotaUsage
}): UpgradeVerdict {
  const { current, target, usage } = args

  if (current && target.sort_order <= current.sort_order) {
    return { ok: false, reason: 'NOT_AN_UPGRADE' }
  }

  const overflow = firstDimensionThatDoesNotFit(target, usage)
  if (overflow) {
    return { ok: false, reason: 'USAGE_EXCEEDS_TARGET', dimension: overflow }
  }

  return { ok: true }
}

function firstDimensionThatDoesNotFit(
  target: SaasPlanRow,
  usage: OrgQuotaUsage
): QuotaKind | null {
  // Teachers first: it is the value metric, so it is the dimension a rejection
  // should name when more than one is over.
  if (target.teachers_quota != null && usage.teachersUsed > target.teachers_quota) {
    return 'teachers'
  }
  if (target.students_quota != null && usage.studentsUsed > target.students_quota) {
    return 'students'
  }
  if (
    target.lessons_monthly_quota != null &&
    usage.lessonsUsed > target.lessons_monthly_quota
  ) {
    return 'lessons_monthly'
  }
  return null
}
