/**
 * Money in a WhatsApp message, Deno mirror of src/lib/i18n/formatCurrency.ts.
 *
 * Always two decimals — a parent comparing a payment request to a bank line
 * needs the exact figure. The symbol lives here rather than in the template
 * body so an org on a non-ILS currency is not sent a hardcoded '₪'.
 *
 * IMPORTANT: this is for the FREE-FORM body only. The Meta-approved v2/v3
 * templates still carry a literal '₪' in their approved copy, so their body
 * parameters must stay a bare number — passing a formatted string there renders
 * '₪₪250.00'. See sendSmartPayButton's callers.
 */

import type { AppLocale } from './templates.ts'

const INTL_LOCALES: Record<AppLocale, string> = { he: 'he-IL', en: 'en-IL' }

export function formatBotMoney(
  amount: number,
  locale: AppLocale,
  currency = 'ILS'
): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale] ?? 'he-IL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
