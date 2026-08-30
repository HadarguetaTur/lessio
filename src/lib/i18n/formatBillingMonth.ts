import { DateTime } from 'luxon'
import { toLuxonLocale, type AppLocale } from './locale'

/**
 * Billing month as a person would say it: "2026-08" → "אוגוסט 2026" / "August 2026".
 *
 * `student_monthly_billing.billing_month` is stored as `yyyy-MM`, which is the
 * right shape for a key and the wrong shape for a sentence. It was reaching
 * parents verbatim inside the WhatsApp payment request ("חיוב חודשי 2026-08")
 * and in the description on the payment page.
 *
 * An unparseable month is returned as-is: a charge description that reads
 * slightly wrong beats one that throws while a parent is waiting to pay.
 */
export function formatBillingMonth(month: string, locale: AppLocale): string {
  const dt = DateTime.fromFormat(month, 'yyyy-MM')
  if (!dt.isValid) return month
  return dt.setLocale(toLuxonLocale(locale)).toFormat('LLLL yyyy')
}
