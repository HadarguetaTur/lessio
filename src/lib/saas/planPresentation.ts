import type { SaasPlanName } from './types'

/**
 * Plan identity that is a PRODUCT decision rather than a row in the catalog.
 *
 * These live in code, not in `saas_plans`, on purpose: changing what a trial
 * grants, or which tiers are purchasable, should go through code review and a
 * deploy — not an unaudited admin form. They are also type-checked against
 * SaasPlanName, so retiring a name breaks the build instead of failing at
 * runtime in a request nobody is watching.
 */

/**
 * The plan an active trial is entitled to — both its features and its quotas.
 *
 * Quotas as well as features: the value metric is teacher seats, so a trial
 * capped at the `free` row's seats could not demonstrate the product being
 * sold. getEffectiveSaasPlan() in ./subscriptions.ts resolves this.
 *
 * This constant exists so the next repricing does not leave the same landmine
 * a bare getSaasPlanByName('studio') would: a retired name resolves to null,
 * and the trial path treats null as "grant everything".
 */
export const TRIAL_ENTITLEMENT_PLAN = 'studio' satisfies SaasPlanName

/** Tiers a tenant can buy self-serve, cheapest first. */
export const PURCHASABLE_PLAN_NAMES = ['solo', 'studio', 'center'] as const

export type PurchasableSaasPlanName = (typeof PURCHASABLE_PLAN_NAMES)[number]

export function isPurchasablePlanName(name: string): name is PurchasableSaasPlanName {
  return (PURCHASABLE_PLAN_NAMES as readonly string[]).includes(name)
}

/**
 * How each plan renders. Keyed as a full Record<SaasPlanName, …> so TypeScript
 * demands an entry for every name — including the retired `basic` and
 * `advanced`, whose bullets must stay in messages/*.json because customers
 * still holding those rows see their own plan card.
 *
 * `i18nKey` is the segment under `saas.accountBilling.upgrade.plans.*` and
 * `onboarding.planSelection.plans.*`. planPresentation.test.ts asserts every
 * key resolves in both catalogs.
 */
export const PLAN_UI: Record<SaasPlanName, { i18nKey: string; featured: boolean }> = {
  free: { i18nKey: 'free', featured: false },
  solo: { i18nKey: 'solo', featured: false },
  studio: { i18nKey: 'studio', featured: true },
  center: { i18nKey: 'center', featured: false },
  custom: { i18nKey: 'center', featured: false },
  // Retired — reachable only by customers who bought them.
  basic: { i18nKey: 'basic', featured: false },
  advanced: { i18nKey: 'advanced', featured: false },
}
