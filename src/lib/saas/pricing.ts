/**
 * How the numbers in `saas_plans` relate to VAT — one switch, because the
 * answer changes on a single day and must not be hunted for across the code.
 *
 * Today Lessio's company is an עוסק פטור (VAT-exempt dealer): it may not charge
 * VAT and may not issue a tax invoice. So a plan price is the whole story —
 * ₪199 is ₪199, nothing is added at checkout, and the document Sumit issues is
 * a חשבון/קבלה with no VAT line. `PRICES_INCLUDE_VAT = true` says exactly that
 * to Sumit: the `UnitPrice` we send is the final amount.
 *
 * The exemption has an annual turnover ceiling. Crossing it forces a move to
 * עוסק מורשה, and from that day the same prices must carry VAT. Set
 * `SAAS_PRICES_INCLUDE_VAT=false` and Sumit will add VAT on top of the plan
 * price instead of reading it as the total.
 *
 * Two things must change together on that day, and neither is inferable from
 * the other:
 *   1. this flag, which decides what the customer is actually charged;
 *   2. `pricing.vatNote` in src/lib/marketing/landingCopy.ts (he + en), which
 *      is what the customer was promised before they clicked.
 */
export const PRICES_INCLUDE_VAT = process.env.SAAS_PRICES_INCLUDE_VAT !== 'false'
