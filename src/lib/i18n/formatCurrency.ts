/**
 * Locale-aware currency formatter for ILS amounts.
 * Returns ₪-prefixed string formatted for the given locale.
 */
export function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
