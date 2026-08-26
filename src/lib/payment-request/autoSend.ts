/**
 * Auto payment request — fire-and-forget helper.
 * Called after createLessonCharge succeeds when the lesson is marked completed.
 *
 * If the org has auto_send_payment_request = true AND a payment provider is configured,
 * creates a payment link, saves it to the charge, and sends a WhatsApp message to the parent.
 *
 * Failures are caught and logged — this function never throws.
 * Per /docs/sprint-9-scope.md § Story 5.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { getPaymentProvider } from '@/lib/payments/factory'
import { PaymentProviderNotConfiguredError } from '@/lib/payments'
import { sendPaymentWithButton } from '@/lib/whatsapp/sendSmart'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { buildPaymentRequestMessage } from './index'

export async function autoSendPaymentRequest(lessonId: string, orgId: string): Promise<void> {
  const db = createServiceRoleClient()

  try {
    // 1. Load org settings — single query covers all needed fields
    const { data: org } = await db
      .from('organizations')
      .select('auto_send_payment_request, automation_payment_request_enabled, payment_provider, whatsapp_phone_number_id, whatsapp_access_token, timezone, default_locale')
      .eq('id', orgId)
      .single()

    if (!org?.auto_send_payment_request || !org?.payment_provider) return

    // WhatsApp-automations toggle (Sprint 31) — ANDed with the legacy master
    // switch above. Manual sends from /billing are intentionally not gated.
    if (org.automation_payment_request_enabled === false) {
      console.info('[autoSendPaymentRequest] automation_payment_request_enabled is off — skipping', { orgId, lessonId })
      return
    }

    const encryptedToken = org.whatsapp_access_token as string | null
    const phoneNumberId = org.whatsapp_phone_number_id as string | null
    const timezone = (org.timezone as string | null) ?? 'Asia/Jerusalem'

    if (!encryptedToken || !phoneNumberId) {
      console.warn('[autoSendPaymentRequest] WhatsApp not configured', { orgId, lessonId })
      return
    }

    // 2. Find the lesson charge (created by createLessonCharge moments before)
    const { data: charge } = await db
      .from('charges')
      .select('id, amount, charge_type, parent_id, lessons(start_at)')
      .eq('organization_id', orgId)
      .eq('lesson_id', lessonId)
      .eq('charge_type', 'lesson')
      .single()

    if (!charge) {
      console.warn('[autoSendPaymentRequest] Lesson charge not found', { orgId, lessonId })
      return
    }

    // 3. Load billing parent
    const { data: parent } = await db
      .from('parents')
      .select('id, full_name, phone, preferred_locale')
      .eq('id', charge.parent_id)
      .eq('organization_id', orgId)
      .single()

    if (!parent?.phone) {
      console.warn('[autoSendPaymentRequest] Parent not found or has no phone', {
        orgId,
        lessonId,
        chargeId: charge.id,
      })
      return
    }

    // The description shows on the checkout page the parent lands on, so it
    // follows their language rather than the org's.
    const recipientLocale = resolveRecipientLocale({
      stored: parent.preferred_locale as string | null,
      orgDefault: org.default_locale as string | null,
    })

    // 4. Create payment link via provider
    const { provider, providerName } = await getPaymentProvider(orgId)
    const paymentResult = await provider.createPaymentLink({
      chargeId: charge.id,
      amount: Number(charge.amount),
      description: (await getT('receipts', recipientLocale))('lessonPayment', {
        name: parent.full_name as string,
      }),
      orgId,
      payer: { fullName: parent.full_name as string, phone: parent.phone },
    })

    // 5. Persist payment link on the charge
    await db
      .from('charges')
      .update({
        payment_link: paymentResult.url,
        payment_reference: paymentResult.reference,
        payment_provider: providerName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', charge.id)
      .eq('organization_id', orgId)

    // 6. Decrypt WhatsApp token and send message
    const accessToken = decryptToken(encryptedToken)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lessonStartAt = (charge.lessons as any)?.start_at ?? null

    const chargesForMessage = [
      {
        id: charge.id,
        amount: Number(charge.amount),
        charge_type: charge.charge_type as 'lesson',
        lesson_start_at: lessonStartAt,
        student_name: null,
      },
    ]

    const message = buildPaymentRequestMessage(
      parent.full_name,
      chargesForMessage,
      timezone,
      paymentResult.url,
      recipientLocale
    )

    // sendPaymentWithButton applies the opt-out / welcome-notice gate itself,
    // and picks the mechanics that actually work for the current window: a
    // cta_url button inside it, the URL-button template outside — where the
    // plain text this used to send failed with 131047 every time.
    try {
      const result = await sendPaymentWithButton({
        orgId,
        phone: parent.phone,
        accessToken,
        phoneNumberId,
        templateType: 'payment_request',
        vars: { amount: Number(charge.amount).toFixed(2), payment_link: paymentResult.url },
        body: message,
        chargeId: charge.id,
        paymentUrl: paymentResult.url,
        locale: recipientLocale,
      })
      if (!result.sent) {
        console.info('[autoSendPaymentRequest] parent opted out — not sending', { orgId, lessonId })
        return
      }
    } catch (sendErr) {
      console.error('[autoSendPaymentRequest] WhatsApp send failed', {
        orgId,
        lessonId,
        error: String(sendErr),
      })
      return
    }

    // 7. Log sent_at on the charge
    await db
      .from('charges')
      .update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', charge.id)
      .eq('organization_id', orgId)

    console.info('[autoSendPaymentRequest] Auto payment request sent', {
      orgId,
      lessonId,
      chargeId: charge.id,
      providerName,
    })
  } catch (err) {
    if (err instanceof PaymentProviderNotConfiguredError) {
      // auto_send_payment_request is true but provider credentials missing — silent skip
      console.info('[autoSendPaymentRequest] Provider not configured, skipping', { orgId, lessonId })
    } else {
      console.error('[autoSendPaymentRequest] Unexpected error', { orgId, lessonId, err })
    }
  }
}
