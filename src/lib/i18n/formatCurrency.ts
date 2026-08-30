import { parseAppLocale, toIntlLocale } from './locale'

/** What `organizations.currency` defaults to. */
export const DEFAULT_CURRENCY = 'ILS'

/**
 * Locale-aware currency formatter.
 * `fractionDigits` defaults to whole units; pass 2 where minor units matter
 * (parent-facing balances and charge lines).
 * `currency` is an ISO 4217 code — pass the org's `currency` column where the
 * amount belongs to an organisation rather than to the platform.
 */
export function formatCurrency(
  amount: number,
  locale: string,
  fractionDigits = 0,
  currency: string = DEFAULT_CURRENCY
): string {
  return new Intl.NumberFormat(toIntlLocale(parseAppLocale(locale)), {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)
}

/**
 * Money the way a screen should show it: whole units drop the ".00", amounts
 * with minor units keep two digits.
 *
 * This is the default for anything rendered in the UI. Reach for
 * `formatCurrency` with an explicit `fractionDigits` only where a fixed shape
 * is part of the contract — parent-facing balances and charge lines that must
 * always read "₪120.00".
 */
export function formatMoney(
  amount: number,
  locale: string,
  currency: string = DEFAULT_CURRENCY
): string {
  return formatCurrency(amount, locale, Number.isInteger(amount) ? 0 : 2, currency)
}

/**
 * Money in a WhatsApp message.
 *
 * Always two decimals — a parent comparing a payment request to a bank line
 * needs the exact figure, and the fixed shape is the long-standing contract for
 * parent-facing amounts. The symbol lives here rather than in the template body
 * so an org on a non-ILS currency is not sent a hardcoded '₪'.
 */
export function formatBotMoney(
  amount: number,
  locale: string,
  currency: string = DEFAULT_CURRENCY
): string {
  return formatCurrency(amount, locale, 2, currency)
}
