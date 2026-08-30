import { parseAppLocale, toIntlLocale } from './locale'

/**
 * Locale-aware currency formatter for ILS amounts.
 * Returns ₪-prefixed string formatted for the given locale.
 * `fractionDigits` defaults to whole shekels; pass 2 where agorot matter
 * (parent-facing balances and charge lines).
 */
export function formatCurrency(amount: number, locale: string, fractionDigits = 0): string {
  return new Intl.NumberFormat(toIntlLocale(parseAppLocale(locale)), {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)
}

/**
 * Money the way a screen should show it: whole shekels drop the ".00", amounts
 * with agorot keep two digits.
 *
 * This is the default for anything rendered in the UI. Reach for
 * `formatCurrency` with an explicit `fractionDigits` only where a fixed shape
 * is part of the contract — parent-facing balances and charge lines that must
 * always read "₪120.00".
 */
export function formatMoney(amount: number, locale: string): string {
  return formatCurrency(amount, locale, Number.isInteger(amount) ? 0 : 2)
}
