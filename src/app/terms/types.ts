import type { PublicPricingRow } from '@/lib/marketing/publicPricing'

/** Values a legal document interpolates — company details and support contacts. */
export type LegalDocProps = {
  email: string
  addr: string
  tel: string
  reg: string
}

/**
 * The Terms additionally publish the price table.
 *
 * It was hardcoded JSX in both language files and nothing kept it in sync with
 * the catalog — so a repricing left a legal document stating a price the
 * product no longer charges. It now reads from saas_plans at render time.
 *
 * Separate from LegalDocProps because the privacy policy shares that type and
 * has no price table.
 */
export type TermsDocProps = LegalDocProps & {
  pricing: PublicPricingRow[]
}
