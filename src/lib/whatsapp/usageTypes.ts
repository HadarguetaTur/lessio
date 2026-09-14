/**
 * WhatsApp usage types and constants — dependency-free on purpose.
 *
 * `usageAnalytics.ts` imports zod, luxon and the service-role client. The
 * usage tab (a client component) only needs these shapes, and importing them
 * from there dragged ~280 KB of zod into the browser bundle.
 */

export type UsageDays = 30 | 60 | 90

export type PricingCategory = 'marketing' | 'utility' | 'service' | 'authentication' | 'unknown'

export const PRICING_CATEGORIES: PricingCategory[] = [
  'marketing',
  'utility',
  'service',
  'authentication',
  'unknown',
]

export interface CategoryTotals {
  volume: number
  costUsd: number
}

export interface WhatsAppUsageSummary {
  days: UsageDays
  /** ISO dates (UTC) of the covered range, inclusive start / exclusive end. */
  startDate: string
  endDate: string
  totalMessages: number
  billableMessages: number
  freeMessages: number
  totalCostUsd: number
  byCategory: Record<PricingCategory, CategoryTotals>
  daily: Array<{
    date: string
    volume: number
    costUsd: number
    byCategory: Partial<Record<PricingCategory, CategoryTotals>>
  }>
  /** When the numbers were fetched from Meta (ISO). */
  fetchedAt: string
  /** True when Meta was unreachable and this is an expired cache copy. */
  stale: boolean
}
