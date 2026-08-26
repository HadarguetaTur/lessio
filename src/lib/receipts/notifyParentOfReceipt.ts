/**
 * Sends the parent the link to a tax document that has just been issued.
 *
 * Shared by both paths that can produce one: a document Lessio issued through
 * a configured provider (issueReceiptForCharge) and a document the payment
 * provider issued itself and told us about over a webhook
 * (recordExternalReceipt). Both are business-initiated, so both go through the
 * opt-out and welcome-notice gate — that rule must not depend on who issued.
 *
 * Best-effort by contract: a payment and its document must never be rolled back
 * because a WhatsApp send failed.
 */

import { decryptToken } from '@/lib/crypto'
import { sendTextMessage } from '@/lib/whatsapp'
import { prepareBusinessSend } from '@/lib/whatsapp/consent'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { resolveRecipientLocale } from '@/lib/i18n/locale'

export async function notifyParentOfReceipt(params: {
  orgId: string
  chargeId: string
  amount: number
  receiptUrl: string
  parentPhone: string | null | undefined
  parentLocale: string | null | undefined
  orgDefaultLocale: string | null | undefined
  phoneNumberId: string | null | undefined
  encryptedToken: string | null | undefined
}): Promise<void> {
  const {
    orgId,
    chargeId,
    amount,
    receiptUrl,
    parentPhone,
    parentLocale,
    orgDefaultLocale,
    phoneNumberId,
    encryptedToken,
  } = params

  if (!parentPhone || !phoneNumberId || !encryptedToken) return

  try {
    const accessToken = decryptToken(encryptedToken)
    const locale = resolveRecipientLocale({
      stored: parentLocale,
      orgDefault: orgDefaultLocale,
    })

    // Business-initiated: honour opt-out and the one-time welcome notice.
    const gate = await prepareBusinessSend({
      orgId,
      phone: parentPhone,
      accessToken,
      phoneNumberId,
      locale,
    })
    if (!gate.ok) {
      console.info('[receipts] receipt notification skipped — parent opted out', { chargeId, orgId })
      return
    }

    const body = await resolveTemplate(
      orgId,
      'receipt_notification',
      { amount: amount.toFixed(2), receipt_url: receiptUrl },
      locale
    )
    await sendTextMessage(parentPhone, body, accessToken, phoneNumberId)
  } catch (err) {
    console.error('[receipts] Failed to send WhatsApp receipt message', {
      chargeId,
      orgId,
      parentPhone,
      err,
    })
  }
}
