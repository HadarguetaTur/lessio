/**
 * Auto payment request — fire-and-forget helpers.
 *
 * `autoSendPaymentRequest(lessonId)` runs after a lesson is settled; it collects
 * the lesson's open charge (a lesson fee or a no-show fee). A lesson paid with a
 * punch has no charge and stops quietly.
 *
 * `autoSendPaymentRequestForCharge(chargeId)` runs after a punch card is sold
 * in a per-lesson org (decision #46).
 *
 * Both require auto_send_payment_request = true AND a payment provider: they
 * create a payment link, save it on the charge, and send it to the parent on
 * WhatsApp. Failures are caught and logged — these functions never throw.
 * Per /docs/sprint-9-scope.md § Story 5.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { getPaymentProvider } from '@/lib/payments/factory'
import { requireMintAmount, NothingToCollectError } from '@/lib/payments/mintAmount'
import { PaymentProviderNotConfiguredError } from '@/lib/payments'
import { sendPaymentWithButton } from '@/lib/whatsapp/sendSmart'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { formatBotMoney } from '@/lib/i18n/formatCurrency'
import { getOrgBillingPolicy } from '@/lib/billing/orgBillingPolicy'

type Db = ReturnType<typeof createServiceRoleClient>
type LogContext = Record<string, string>

interface OrgSettings {
  auto_send_payment_request: boolean | null
  automation_payment_request_enabled: boolean | null
  payment_provider: string | null
  whatsapp_phone_number_id: string | null
  whatsapp_access_token: string | null
  default_locale: string | null
  currency: string | null
}

interface ChargeToCollect {
  id: string
  amount: number
  amount_paid: number | null
  parent_id: string | null
}

/** What the checkout page and the WhatsApp body say the money is for. */
type ChargeWording = 'lesson' | 'pack'

/** The org's switches and WhatsApp wiring, or null when nothing should be sent. */
async function loadSendableOrg(db: Db, orgId: string, log: LogContext): Promise<OrgSettings | null> {
  const { data: org } = await db
    .from('organizations')
    .select('auto_send_payment_request, automation_payment_request_enabled, payment_provider, whatsapp_phone_number_id, whatsapp_access_token, default_locale, currency')
    .eq('id', orgId)
    .single()

  if (!org?.auto_send_payment_request || !org?.payment_provider) return null

  // WhatsApp-automations toggle (Sprint 31) — ANDed with the legacy master
  // switch above. Manual sends from /billing are intentionally not gated.
  if (org.automation_payment_request_enabled === false) {
    console.info('[autoSendPaymentRequest] automation_payment_request_enabled is off — skipping', { orgId, ...log })
    return null
  }

  if (!org.whatsapp_access_token || !org.whatsapp_phone_number_id) {
    console.warn('[autoSendPaymentRequest] WhatsApp not configured', { orgId, ...log })
    return null
  }
  return org as OrgSettings
}

async function requestPayment(
  db: Db,
  orgId: string,
  org: OrgSettings,
  charge: ChargeToCollect,
  wording: ChargeWording,
  log: LogContext
): Promise<void> {
  // The link is minted NET of anything already paid — the same figure the
  // charge_payment_references trigger records. One derivation, one place.
  let mintAmount: number
  try {
    mintAmount = requireMintAmount([charge])
  } catch (err) {
    if (err instanceof NothingToCollectError) {
      console.info('[autoSendPaymentRequest] charge already settled — nothing to collect', {
        orgId,
        ...log,
        chargeId: charge.id,
      })
      return
    }
    throw err
  }

  const { data: parent } = await db
    .from('parents')
    .select('id, full_name, phone, preferred_locale')
    .eq('id', charge.parent_id)
    .eq('organization_id', orgId)
    .single()

  if (!parent?.phone) {
    console.warn('[autoSendPaymentRequest] Parent not found or has no phone', { orgId, ...log, chargeId: charge.id })
    return
  }

  // The description shows on the checkout page the parent lands on, so it
  // follows their language rather than the org's.
  const recipientLocale = resolveRecipientLocale({
    stored: parent.preferred_locale as string | null,
    orgDefault: org.default_locale,
  })
  const tr = await getT('receipts', recipientLocale)

  const { provider, providerName } = await getPaymentProvider(orgId)
  const paymentResult = await provider.createPaymentLink({
    chargeId: charge.id,
    amount: mintAmount,
    description: tr(wording === 'pack' ? 'packPayment' : 'lessonPayment', { name: parent.full_name as string }),
    orgId,
    payer: { fullName: parent.full_name as string, phone: parent.phone },
  })

  // supabase-js returns { error } rather than throwing. Sending the parent a
  // link whose reference was never stored produces a payment no webhook can
  // resolve to a charge, so stop here instead of messaging.
  const { error: persistError } = await db
    .from('charges')
    .update({
      payment_link: paymentResult.url,
      payment_reference: paymentResult.reference,
      payment_provider: providerName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', charge.id)
    .eq('organization_id', orgId)

  if (persistError) {
    console.error('[autoSendPaymentRequest] failed to persist payment reference — not sending', {
      orgId,
      ...log,
      chargeId: charge.id,
      error: persistError.message,
    })
    return
  }

  const accessToken = decryptToken(org.whatsapp_access_token as string)
  const currency = org.currency ?? undefined

  // sendPaymentWithButton applies the opt-out / welcome-notice gate itself,
  // and picks the mechanics that actually work for the current window: a
  // cta_url button inside it, the URL-button template outside — where the
  // plain text this used to send failed with 131047 every time.
  try {
    const result = await sendPaymentWithButton({
      orgId,
      phone: parent.phone,
      accessToken,
      phoneNumberId: org.whatsapp_phone_number_id as string,
      templateType: 'payment_request',
      vars: {
        parent_name: parent.full_name as string,
        amount: formatBotMoney(mintAmount, recipientLocale, currency),
        // Bare figure for the Meta v2/v3 params, whose approved copy already
        // prints the currency symbol. See metaAmountParam.
        amount_value: mintAmount.toFixed(2),
        // A single charge needs no itemisation, so charge_lines stays empty
        // and the description carries the whole story.
        description: tr(wording === 'pack' ? 'waPackCharge' : 'waLessonCharge'),
        charge_lines: '',
        payment_link: paymentResult.url,
      },
      chargeId: charge.id,
      paymentUrl: paymentResult.url,
      locale: recipientLocale,
    })
    if (!result.sent) {
      console.info('[autoSendPaymentRequest] parent opted out — not sending', { orgId, ...log })
      return
    }
  } catch (sendErr) {
    console.error('[autoSendPaymentRequest] WhatsApp send failed', { orgId, ...log, error: String(sendErr) })
    return
  }

  await db
    .from('charges')
    .update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', charge.id)
    .eq('organization_id', orgId)

  console.info('[autoSendPaymentRequest] Auto payment request sent', { orgId, ...log, chargeId: charge.id, providerName })
}

function logFailure(err: unknown, orgId: string, log: LogContext): void {
  if (err instanceof PaymentProviderNotConfiguredError) {
    // auto_send_payment_request is true but provider credentials missing — silent skip
    console.info('[autoSendPaymentRequest] Provider not configured, skipping', { orgId, ...log })
  } else {
    console.error('[autoSendPaymentRequest] Unexpected error', { orgId, ...log, err })
  }
}

export async function autoSendPaymentRequest(lessonId: string, orgId: string): Promise<void> {
  const db = createServiceRoleClient()
  const log = { lessonId }

  try {
    if ((await getOrgBillingPolicy(orgId)).billingMode === 'monthly') return

    const org = await loadSendableOrg(db, orgId, log)
    if (!org) return

    // The lesson's open charge (written by settleLessonOutcome moments before).
    // A no-show fee is collected the same way as a lesson.
    const { data: charge } = await db
      .from('charges')
      .select('id, amount, amount_paid, parent_id')
      .eq('organization_id', orgId)
      .eq('lesson_id', lessonId)
      .in('charge_type', ['lesson', 'no_show'])
      .eq('status', 'pending')
      .single()

    if (!charge) {
      console.warn('[autoSendPaymentRequest] Lesson charge not found', { orgId, lessonId })
      return
    }

    await requestPayment(db, orgId, org, charge as ChargeToCollect, 'lesson', log)
  } catch (err) {
    logFailure(err, orgId, log)
  }
}

/** The payment request for a punch card sold in a per-lesson org. */
export async function autoSendPaymentRequestForCharge(chargeId: string, orgId: string): Promise<void> {
  const db = createServiceRoleClient()
  const log = { chargeId }

  try {
    if ((await getOrgBillingPolicy(orgId)).billingMode === 'monthly') return

    const org = await loadSendableOrg(db, orgId, log)
    if (!org) return

    const { data: charge } = await db
      .from('charges')
      .select('id, amount, amount_paid, parent_id')
      .eq('organization_id', orgId)
      .eq('id', chargeId)
      .eq('charge_type', 'pack')
      .eq('status', 'pending')
      .single()

    if (!charge) {
      console.warn('[autoSendPaymentRequest] Pack charge not found or not open', { orgId, chargeId })
      return
    }

    await requestPayment(db, orgId, org, charge as ChargeToCollect, 'pack', log)
  } catch (err) {
    logFailure(err, orgId, log)
  }
}
