/**
 * Completing a Sumit hosted checkout — the one implementation behind the
 * redirect-return pages (account/billing and onboarding), the webhook and the
 * daily reconciliation.
 *
 * Sumit sends the customer back with OG-PaymentID / OG-CustomerID /
 * OG-ExternalIdentifier. None of that is trusted: the payment id is only used
 * to *look the payment up* at Sumit, and `evaluateCheckoutBinding` decides
 * whether that payment pays for this org's pending checkout. The three
 * callers used to carry their own copies of this and disagreed on details
 * (the webhook fired the Purchase event, the redirect page did not).
 */

import { revalidatePath } from 'next/cache'
import { trackEvent } from '@/lib/tracking/events'
import { notifySuperadmins } from '@/lib/notifications'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { paymentReceiptEmail } from '@/lib/email/templates/saas'
import { evaluateCheckoutBinding, type CheckoutBindingRefusal } from './checkoutBinding'
import { getSaasPlanById } from './plans'
import { sendOwnerEmailOnce } from './ownerNotify'
import {
  SumitApiError,
  findSumitDocumentForPayment,
  getSumitPayment,
  type SumitPayment,
} from './sumit'
import {
  activateSubscriptionFromPayment,
  getOrgSubscriptionState,
  markOrganizationOnboardingComplete,
  revertPendingCheckout,
  type ActivationRefusal,
} from './subscriptions'

export interface CheckoutReturnQuery {
  paymentId: string | null
  customerId: string | null
  externalIdentifier: string | null
  cancelled: boolean
}

type SearchParams = Record<string, string | string[] | undefined>

function first(sp: SearchParams, key: string): string | null {
  const v = sp[key]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.trim() ? s.trim() : null
}

/** Reads Sumit's OG-* params (case as documented; also accepts lowercase). */
export function parseCheckoutReturnQuery(sp: SearchParams, opts?: { cancelled?: boolean }): CheckoutReturnQuery {
  return {
    paymentId: first(sp, 'OG-PaymentID') ?? first(sp, 'og-paymentid'),
    customerId: first(sp, 'OG-CustomerID') ?? first(sp, 'og-customerid'),
    externalIdentifier: first(sp, 'OG-ExternalIdentifier') ?? first(sp, 'og-externalidentifier'),
    cancelled: opts?.cancelled === true,
  }
}

export type CheckoutReturnOutcome = 'activated' | 'already_active' | 'cancelled' | 'pending' | 'refused'

export type CheckoutReturnResult = {
  outcome: CheckoutReturnOutcome
  refusal?: CheckoutBindingRefusal | ActivationRefusal
}

export async function completeCheckoutReturn(p: {
  orgId: string
  query: CheckoutReturnQuery
  source: 'callback' | 'webhook' | 'reconciliation'
}): Promise<CheckoutReturnResult> {
  if (p.query.cancelled) {
    await revertPendingCheckout(p.orgId)
    return { outcome: 'cancelled' }
  }

  if (!p.query.paymentId) {
    return statusOnly(p.orgId)
  }

  let payment: SumitPayment
  try {
    payment = await getSumitPayment(p.query.paymentId)
  } catch (e) {
    const detail = e instanceof SumitApiError ? { code: e.code, message: e.userMessage ?? e.technicalDetails } : String(e)
    console.error('[saas/checkout] payment lookup failed', { orgId: p.orgId, paymentId: p.query.paymentId, detail })
    return statusOnly(p.orgId)
  }

  const db = createServiceRoleClient()
  const { data: sub } = await db
    .from('organization_subscriptions')
    .select('id, status, plan_id, billing_interval, pending_checkout_reference, pending_checkout_started_at, sumit_customer_id')
    .eq('organization_id', p.orgId)
    .maybeSingle()

  if (!sub) return { outcome: 'pending' }

  if (sub.status !== 'pending_payment') {
    return statusOnly(p.orgId)
  }

  const plan = await getSaasPlanById(sub.plan_id)
  const interval = (sub.billing_interval as 'monthly' | 'yearly') ?? 'monthly'
  const expectedAmount =
    plan == null ? 0 : interval === 'yearly' && plan.price_yearly != null ? plan.price_yearly : plan.price_monthly

  const { data: priorInvoice } = await db
    .from('saas_invoices')
    .select('id')
    .eq('sumit_payment_id', payment.id)
    .eq('status', 'paid')
    .limit(1)
    .maybeSingle()

  const verdict = evaluateCheckoutBinding({
    payment,
    urlExternalIdentifier: p.query.externalIdentifier,
    urlCustomerId: p.query.customerId,
    sub: {
      status: sub.status,
      pendingCheckoutReference: sub.pending_checkout_reference,
      pendingCheckoutStartedAt: sub.pending_checkout_started_at,
      sumitCustomerId: sub.sumit_customer_id,
      expectedAmount,
    },
    paymentIdAlreadyRecorded: Boolean(priorInvoice),
    now: new Date(),
  })

  if (!verdict.ok) {
    await recordRefusedActivation({ orgId: p.orgId, subscriptionId: sub.id, payment, reason: verdict.reason, source: p.source })
    return { outcome: 'refused', refusal: verdict.reason }
  }

  const document = await findSumitDocumentForPayment({
    customerId: payment.customerId,
    paidOn: payment.date ? new Date(payment.date) : new Date(),
  })

  const result = await activateSubscriptionFromPayment({
    orgId: p.orgId,
    checkoutReference: sub.pending_checkout_reference!,
    paidAmount: payment.amount,
    sumitCustomerId: payment.customerId || p.query.customerId,
    sumitPaymentToken: payment.token,
    cardLastFour: payment.last4,
    cardExpiryMonth: payment.expiryMonth,
    cardExpiryYear: payment.expiryYear,
    sumitPaymentId: payment.id,
    invoice: {
      amount: payment.amount,
      sumitDocumentId: document?.documentId ?? null,
      sumitDocumentUrl: document?.documentUrl ?? null,
    },
  })

  if (!result.activated) {
    if (result.reason === 'no_pending_subscription') {
      // The other path (callback vs webhook) won the race. Expected.
      return statusOnly(p.orgId)
    }
    await recordRefusedActivation({ orgId: p.orgId, subscriptionId: sub.id, payment, reason: result.reason, source: p.source })
    return { outcome: 'refused', refusal: result.reason }
  }

  await markOrganizationOnboardingComplete(p.orgId)
  revalidatePath('/account/billing')

  // Per /docs/sprint-34-scope.md § C step 4 — the server-side revenue event
  // that lets Meta optimise for paying subscribers and makes CAC computable.
  void trackEvent({ event: 'Purchase', organizationId: p.orgId, value: payment.amount, currency: 'ILS' })

  const state = await getOrgSubscriptionState(p.orgId)
  void sendOwnerEmailOnce({
    orgId: p.orgId,
    logType: 'saas_lifecycle_email',
    dedupKey: `saas_receipt:${sub.id}:${payment.id}`,
    build: (owner) =>
      paymentReceiptEmail(
        {
          orgName: owner.orgName,
          planName: (owner.locale === 'en' ? plan?.display_name_en : plan?.display_name_he) ?? plan?.name ?? '',
          amount: payment.amount,
          periodStart: new Date().toISOString(),
          periodEnd: state?.currentPeriodEnd ?? new Date().toISOString(),
          documentUrl: document?.documentUrl ?? null,
          billingUrl: `${getShareableBaseUrl()}/account/billing`,
        },
        owner.locale
      ),
  })

  console.info('[saas/checkout] subscription activated', { orgId: p.orgId, source: p.source, paymentId: payment.id })
  return { outcome: 'activated' }
}

async function statusOnly(orgId: string): Promise<CheckoutReturnResult> {
  const state = await getOrgSubscriptionState(orgId)
  if (state?.status === 'active') {
    await markOrganizationOnboardingComplete(orgId)
    return { outcome: 'already_active' }
  }
  return { outcome: 'pending' }
}

/**
 * A valid Sumit payment that this org's checkout cannot claim. Money may have
 * moved (a genuine underpayment) or someone is probing (a replayed id). Either
 * way: a failed invoice row so /admin/revenue shows it, a loud log, and a
 * superadmin notification. The pending row is left alone — the owner can
 * retry from /account/billing and support can see what happened.
 */
async function recordRefusedActivation(p: {
  orgId: string
  subscriptionId: string
  payment: SumitPayment
  reason: CheckoutBindingRefusal | ActivationRefusal
  source: string
}): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db.from('saas_invoices').insert({
    organization_id: p.orgId,
    subscription_id: p.subscriptionId,
    amount: p.payment.amount,
    currency: 'ILS',
    status: 'failed',
    source: 'checkout',
    sumit_payment_id: p.payment.id,
    failure_reason: p.reason,
    issued_at: new Date().toISOString(),
  })
  if (error && error.code !== '23505') {
    console.error('[saas/checkout] failed to record refused activation', { orgId: p.orgId, error: error.message })
  }

  console.error('[saas/checkout] activation refused', {
    orgId: p.orgId,
    source: p.source,
    reason: p.reason,
    paymentId: p.payment.id,
    amount: p.payment.amount,
  })

  await notifySuperadmins(
    'saas_activation_refused',
    `Sumit payment refused: ${p.reason}`,
    `Org ${p.orgId} · payment ${p.payment.id} · ₪${p.payment.amount} · via ${p.source}`,
    `/admin/orgs/${p.orgId}`
  )
}
