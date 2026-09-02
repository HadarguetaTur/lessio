/**
 * Tells a parent that a payment the tutor recorded by hand has been received.
 *
 * One message covers every manual path — a full payment, a partial one (the
 * remaining balance is appended), or a whole balance settled at once — and it
 * carries the receipt link when a tax document was issued for the payment, so
 * the parent never gets a "thank you" and a "here is your receipt" as two
 * separate bubbles. The receipt path's own notification is suppressed by the
 * callers for that reason (issueReceiptForCharge's `notifyParent: false`).
 *
 * Goes through sendSmartMessage: the tutor typically records a payment days
 * after the parent last wrote in, so the 24h window is usually closed and the
 * Meta-approved `lessio_payment_received_*` template is what actually goes out.
 *
 * Best-effort by contract: a payment that has already been written must never
 * be rolled back because WhatsApp was unhappy.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { botString } from '@/lib/whatsapp/strings'
import { resolveRecipientLocale, type AppLocale } from '@/lib/i18n/locale'
import { formatBotMoney } from '@/lib/i18n/formatCurrency'

export interface PaymentNotificationInput {
  orgId: string
  parentId: string
  /** The charges this payment touched — for logging only. */
  chargeIds: string[]
  /** What came in now. */
  amount: number
  /** What the parent still owes across these charges after this payment. */
  remaining: number
  /** Tax documents issued for the charges this payment closed, if any. */
  receiptUrls: string[]
}

/**
 * The template variables for a payment confirmation. Exported for tests — the
 * send itself needs credentials, this is the part worth pinning.
 */
export function buildPaymentReceivedVars(params: {
  parentName: string
  amount: number
  remaining: number
  receiptUrls: string[]
  locale: AppLocale
  currency?: string
}): Record<string, string> {
  const { parentName, amount, remaining, receiptUrls, locale, currency } = params
  return {
    parent_name: parentName,
    amount: formatBotMoney(amount, locale, currency),
    balance_line:
      remaining > 0
        ? botString('payment_received_balance_line', locale, {
            remaining: formatBotMoney(remaining, locale, currency),
          })
        : '',
    receipt_line: receiptUrls
      .map((url) => botString('payment_received_receipt_line', locale, { url }))
      .join(''),
  }
}

export async function notifyParentOfPayment(input: PaymentNotificationInput): Promise<void> {
  const { orgId, parentId, chargeIds, amount, remaining, receiptUrls } = input

  try {
    const db = createServiceRoleClient()
    const [{ data: parent }, { data: org }] = await Promise.all([
      db
        .from('parents')
        .select('full_name, phone, preferred_locale')
        .eq('id', parentId)
        .eq('organization_id', orgId)
        .maybeSingle(),
      db
        .from('organizations')
        .select('whatsapp_phone_number_id, whatsapp_access_token, default_locale, currency')
        .eq('id', orgId)
        .maybeSingle(),
    ])

    const phone = parent?.phone as string | null | undefined
    const phoneNumberId = org?.whatsapp_phone_number_id as string | null | undefined
    const encryptedToken = org?.whatsapp_access_token as string | null | undefined
    if (!parent || !phone || !phoneNumberId || !encryptedToken) {
      console.info('[charges] payment confirmation skipped — no phone or WhatsApp not connected', {
        orgId,
        parentId,
        chargeIds,
      })
      return
    }

    const accessToken = decryptToken(encryptedToken)
    const locale = resolveRecipientLocale({
      stored: parent.preferred_locale as string | null,
      orgDefault: org?.default_locale as string | null,
    })

    const result = await sendSmartMessage({
      orgId,
      phone,
      accessToken,
      phoneNumberId,
      templateType: 'payment_received',
      vars: buildPaymentReceivedVars({
        parentName: parent.full_name as string,
        amount,
        remaining,
        receiptUrls,
        locale,
        currency: (org?.currency as string | null) ?? undefined,
      }),
      locale,
    })

    if (!result.sent) {
      console.info('[charges] payment confirmation not sent', { orgId, parentId, reason: result.reason })
    }
  } catch (err) {
    console.error('[charges] payment confirmation failed', { orgId, parentId, chargeIds, err })
  }
}
