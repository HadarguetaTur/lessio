import { listAllSaasPlans } from '@/lib/saas/plans'

export type PublicPricingRow = {
  name: string
  labelHe: string
  labelEn: string
  priceMonthly: number
  priceYearly: number | null
  teachersQuota: number | null
  isCustom: boolean
}

/**
 * The tiers shown on public, unauthenticated pages — the landing page and the
 * pricing table inside the Terms of Use.
 *
 * Those two used to disagree with the database and with each other: the Terms
 * table was hardcoded JSX, so it would have gone on asserting a ₪99 plan exists
 * while checkout charged ₪149. A legal document that misstates the price is a
 * worse bug than a stale marketing page.
 *
 * Returns an empty list if the catalog cannot be read, and callers omit the
 * section rather than showing anything. There is deliberately NO hardcoded
 * fallback: a second copy of the prices is exactly the drift this function
 * exists to remove, and on a legal page an absent table is safer than a
 * confidently wrong one.
 */
export async function getPublicPricingRows(): Promise<PublicPricingRow[]> {
  // Center is intentionally retired from checkout but remains a public offer:
  // it is the bespoke option for organizations above Studio's five seats.
  const plans = await listAllSaasPlans()

  return plans
    .filter((p) => ['solo', 'studio', 'center'].includes(p.name))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      name: p.name,
      labelHe: p.display_name_he,
      labelEn: p.display_name_en,
      priceMonthly: p.price_monthly,
      priceYearly: p.price_yearly,
      teachersQuota: p.teachers_quota,
      isCustom: p.name === 'center',
    }))
}
