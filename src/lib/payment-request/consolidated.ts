/**
 * Consolidated payment request — one link per parent, covering every open charge.
 *
 * A parent with three children previously received three messages and three
 * payment links for the same month. This mints a single link for the total and
 * stamps its reference on all the included charges, which is exactly what the
 * webhook already matches on (`src/app/api/payments/[provider]/route.ts`): one
 * payment settles the whole group with no change to reconciliation.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { getPaymentProvider } from '@/lib/payments/factory'
import { PaymentProviderNotConfiguredError } from '@/lib/payments'
import { sendPaymentWithButton } from '@/lib/whatsapp/sendSmart'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { logChargeAudit } from '@/lib/charges/audit'
import { formatBotMoney } from '@/lib/i18n/formatCurrency'
import { getPendingChargesForParent, logPaymentRequestSent } from './index'
import { buildChargeLines } from './chargeLines'

export type ConsolidatedOutcome =
  | 'sent'
  | 'opted_out'
  | 'no_phone'
  | 'no_open_charges'
  | 'whatsapp_not_connected'
  | 'no_payment_provider'
  | 'failed'

export async function sendConsolidatedPaymentRequest(
  orgId: string,
  parentId: string,
  actorProfileId: string
): Promise<ConsolidatedOutcome> {
  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token, default_locale, timezone, currency')
    .eq('id', orgId)
    .single()

  const encryptedToken = org?.whatsapp_access_token as string | null
  const phoneNumberId = org?.whatsapp_phone_number_id as string | null
  if (!encryptedToken || !phoneNumberId) return 'whatsapp_not_connected'

  const { data: parent } = await db
    .from('parents')
    .select('id, full_name, phone, preferred_locale')
    .eq('id', parentId)
    .eq('organization_id', orgId)
    .single()

  if (!parent?.phone) return 'no_phone'

  // Amounts here are already net of partial payments.
  const charges = await getPendingChargesForParent(parentId, orgId)
  if (charges.length === 0) return 'no_open_charges'

  const total = Math.round(charges.reduce((sum, c) => sum + c.amount, 0) * 100) / 100
  if (total <= 0) return 'no_open_charges'

  const chargeIds = charges.map((c) => c.id)
  const locale = resolveRecipientLocale({
    stored: parent.preferred_locale as string | null,
    orgDefault: (org?.default_locale as string | null) ?? null,
  })

  // The request row is created first so its id can be handed to the provider as
  // the "charge" it is collecting for — matching is by the returned reference.
  const { data: request, error: requestError } = await db
    .from('payment_requests')
    .insert({
      organization_id: orgId,
      parent_id: parentId,
      charge_ids: chargeIds,
      total_amount: total,
      created_by_profile_id: actorProfileId,
    })
    .select('id')
    .single()

  if (requestError || !request) {
    console.error('[consolidatedPaymentRequest] could not create request', {
      orgId,
      parentId,
      error: requestError?.message,
    })
    return 'failed'
  }

  const requestId = request.id as string
  const tr = await getT('receipts', locale)
  const timezone = (org?.timezone as string | null) ?? 'Asia/Jerusalem'
  const currency = (org?.currency as string | null) ?? undefined

  let paymentUrl: string
  let paymentReference: string
  let providerName: string
  try {
    const { provider, providerName: name } = await getPaymentProvider(orgId)
    providerName = name
    const result = await provider.createPaymentLink({
      chargeId: requestId,
      amount: total,
      description: tr('lessonPayment', { name: parent.full_name as string }),
      orgId,
      payer: { fullName: parent.full_name as string, phone: parent.phone as string },
    })
    paymentUrl = result.url
    paymentReference = result.reference
  } catch (err) {
    if (
      process.env.DEMO_PAYMENT_LINK_ENABLED === '1' &&
      err instanceof PaymentProviderNotConfiguredError
    ) {
      providerName = 'demo'
      paymentUrl = `${getShareableBaseUrl()}/portal/${orgId}`
      paymentReference = `demo-${requestId}`
    } else {
      await db.from('payment_requests').update({ status: 'failed' }).eq('id', requestId)
      if (err instanceof PaymentProviderNotConfiguredError) return 'no_payment_provider'
      throw err
    }
  }

  // Any earlier open request covering these charges is replaced by this one.
  await db
    .from('payment_requests')
    .update({ status: 'superseded' })
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)
    .eq('status', 'sent')
    .neq('id', requestId)

  await db
    .from('payment_requests')
    .update({
      payment_link: paymentUrl,
      payment_reference: paymentReference,
      payment_provider: providerName,
    })
    .eq('id', requestId)

  // The shared reference is what makes one payment settle every charge.
  await db
    .from('charges')
    .update({
      payment_link: paymentUrl,
      payment_reference: paymentReference,
      payment_provider: providerName,
      updated_at: new Date().toISOString(),
    })
    .in('id', chargeIds)
    .eq('organization_id', orgId)

  const result = await sendPaymentWithButton({
    orgId,
    phone: parent.phone as string,
    accessToken: decryptToken(encryptedToken),
    phoneNumberId,
    templateType: 'payment_request',
    vars: {
      parent_name: parent.full_name as string,
      amount: formatBotMoney(total, locale, currency),
      amount_value: total.toFixed(2),
      // A bare noun phrase — the template supplies the preposition around it.
      description: tr('waConsolidated', { count: String(chargeIds.length) }),
      // Only the free-form in-window send can carry the breakdown; Meta rejects
      // newlines in a template parameter, so out of window `param()` flattens it.
      charge_lines: buildChargeLines(charges, { timezone, locale, currency }),
      payment_link: paymentUrl,
    },
    // Every charge in the request now carries the same link, so any of them
    // resolves the button to the same checkout.
    chargeId: chargeIds[0],
    paymentUrl,
    locale,
  })

  if (!result.sent) {
    await db.from('payment_requests').update({ status: 'superseded' }).eq('id', requestId)
    return 'opted_out'
  }

  await logPaymentRequestSent(chargeIds, orgId, actorProfileId)

  await Promise.all(
    chargeIds.map((chargeId) =>
      logChargeAudit({
        organizationId: orgId,
        chargeId,
        parentId,
        eventType: 'payment_request_sent',
        actorProfileId,
        metadata: {
          payment_request_id: requestId,
          provider: providerName,
          total,
          charge_count: chargeIds.length,
        },
      })
    )
  )

  console.info('[consolidatedPaymentRequest] sent', {
    orgId,
    parentId,
    requestId,
    chargeCount: chargeIds.length,
    total,
  })

  return 'sent'
}
