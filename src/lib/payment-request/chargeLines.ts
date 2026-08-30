/**
 * The itemised charge breakdown that goes into a payment request's
 * `{{charge_lines}}` variable.
 *
 * This used to be `buildPaymentRequestMessage`, which composed a whole message
 * from a private string table — greeting, intro, pay header and all. That meant
 * the automatic payment request after a lesson, and the manual one from
 * /parents, silently ignored the body the owner had edited in settings. Only
 * the breakdown is genuinely dynamic, so only the breakdown stays in code; the
 * words around it belong to the template.
 *
 * Same shape as the `charge_lines` of `payment_history_reply` and the
 * `lesson_lines` of `schedule_reply`: a block that starts with a newline so a
 * template can splice it in mid-line, and is empty when there is nothing to say.
 *
 * Pure — no DB, no side effects.
 */

import { toIntlLocale, type AppLocale } from '@/lib/i18n/locale'
import { formatBotMoney, DEFAULT_CURRENCY } from '@/lib/i18n/formatCurrency'
import { botString, type BotStringKey } from '@/lib/whatsapp/strings'
import type { PaymentRequestCharge } from './index'

const TYPE_KEYS: Record<PaymentRequestCharge['charge_type'], BotStringKey> = {
  lesson: 'charge_type_lesson',
  cancellation: 'charge_type_cancellation',
  manual: 'charge_type_manual',
  monthly: 'charge_type_monthly',
}

export interface ChargeLinesOptions {
  timezone: string
  locale: AppLocale
  /** ISO 4217, from `organizations.currency`. */
  currency?: string
}

/**
 * Returns '' for a single charge — the template body already names the amount
 * and the description, and repeating them as a one-row "breakdown" reads as a
 * bug rather than as detail.
 */
export function buildChargeLines(
  charges: PaymentRequestCharge[],
  { timezone, locale, currency = DEFAULT_CURRENCY }: ChargeLinesOptions
): string {
  if (charges.length <= 1) return ''

  const lines = charges.map((charge, index) => {
    const label = botString(TYPE_KEYS[charge.charge_type] ?? 'charge_type_manual', locale)

    let detail = ''
    if (charge.student_name) {
      detail += ` ${botString('charge_item_of', locale)} ${charge.student_name}`
    }
    if (charge.lesson_start_at) {
      const date = new Date(charge.lesson_start_at).toLocaleDateString(toIntlLocale(locale), {
        timeZone: timezone,
        day: 'numeric',
        month: 'long',
      })
      detail += `, ${date}`
    }

    return botString('charge_item_line', locale, {
      index: String(index + 1),
      label,
      detail,
      amount: formatBotMoney(charge.amount, locale, currency),
    })
  })

  const total = charges.reduce((sum, c) => sum + c.amount, 0)
  const totalLine = botString('charge_lines_total', locale, {
    total: formatBotMoney(total, locale, currency),
  })

  return `\n${lines.join('\n')}\n${totalLine}`
}
