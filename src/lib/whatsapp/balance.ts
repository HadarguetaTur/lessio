/**
 * Balance-reply helpers.
 *
 * A parent asking "כמה אני חייבת" needs two things: the number, and what to do
 * about it. What they can do depends on what the teacher configured — a
 * connected payment provider stamps a payment link on each charge, and without
 * one the only route to settling up is talking to the teacher.
 *
 * The link is only offered directly when it settles the WHOLE balance, i.e.
 * there is exactly one open charge. With several open charges each link covers
 * its own charge, so the parent is sent to the portal where they are listed
 * separately — quoting one of them under a larger total would be wrong.
 */

import type { AppLocale } from '@/lib/i18n/locale'
import { botString } from './strings'

export interface OpenCharge {
  amount: number
  payment_link: string | null
}

export function sumOpenCharges(charges: OpenCharge[]): number {
  return charges.reduce((sum, c) => sum + Number(c.amount), 0)
}

/** Builds the "how to pay" paragraph spliced into the balance_reply template. */
export function resolvePaymentLine(charges: OpenCharge[], locale: AppLocale): string {
  const withLink = charges.filter((c) => c.payment_link)

  if (charges.length === 1 && withLink.length === 1) {
    return botString('balance_pay_link', locale, { payment_link: withLink[0].payment_link! })
  }
  if (withLink.length > 0) {
    return botString('balance_pay_portal', locale)
  }
  return botString('balance_pay_contact', locale)
}
