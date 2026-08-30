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
