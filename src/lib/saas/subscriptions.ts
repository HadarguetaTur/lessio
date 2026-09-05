import { cache } from 'react'
import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { encryptSaasPaymentToken } from '@/lib/crypto'
import { AMOUNT_TOLERANCE, type CheckoutBindingRefusal } from './checkoutBinding'
import { getSaasPlanById, getSaasPlanByName, type SaasPlanRow } from './plans'
import { TRIAL_ENTITLEMENT_PLAN } from './planPresentation'
import type { SaasPlanName, SaasSubscriptionStatus } from './types'
import { parseSaasFeatures, type SaasFeatures } from './types'

/** Free-trial length. The signup path (src/lib/auth/createOrgWithOwner.ts) imports this. */
export const TRIAL_DAYS = 30

export type OrgSubscriptionState = {
  subscriptionId: string
  planId: string
  planName: SaasPlanName
  status: SaasSubscriptionStatus
  billingInterval: 'monthly' | 'yearly'
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  cardLastFour: string | null
  features: SaasFeatures
}

/**
 * The Sumit customer this org's saved card is filed under, or null before it
 * has ever paid. Kept off OrgSubscriptionState on purpose: only the billing
 * page's "replace card" link needs it, and that state object is fetched on
 * every dashboard render.
 */
export async function getSumitCustomerIdForOrg(orgId: string): Promise<string | null> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('organization_subscriptions')
    .select('sumit_customer_id')
    .eq('organization_id', orgId)
    .maybeSingle()

  return data?.sumit_customer_id ?? null
}

export async function getOpenCustomPlanInquiry(orgId: string): Promise<{ id: string } | null> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('saas_plan_inquiries')
    .select('id')
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .maybeSingle()

  return data?.id ? { id: data.id } : null
}

/**
 * Memoised per request: the dashboard layout, the owner banners and the lapsed
 * gate all ask this on the same render.
 */
export const getOrgSubscriptionState = cache(async function getOrgSubscriptionState(
  orgId: string
): Promise<OrgSubscriptionState | null> {
  const db = createServiceRoleClient()
  const { data: sub } = await db
    .from('organization_subscriptions')
    .select(
      'id, plan_id, status, billing_interval, trial_ends_at, current_period_end, cancel_at_period_end, card_last_four'
    )
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!sub) return null

  const plan = await getSaasPlanById(sub.plan_id)
  if (!plan) return null

  return {
    subscriptionId: sub.id,
    planId: sub.plan_id,
    planName: plan.name,
    status: sub.status as SaasSubscriptionStatus,
    billingInterval: sub.billing_interval as 'monthly' | 'yearly',
    trialEndsAt: sub.trial_ends_at,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    cardLastFour: sub.card_last_four,
    features: plan.features,
  }
})

/**
 * What the org is actually entitled to. This is the answer `requireFeature` and
 * `assertFeature` act on, so it must describe the plan that was paid for.
 *
 * It used to return the full Advanced set for any read-only org, which meant a
 * lapsed org passed every feature gate — the gates were decorative for exactly
 * the orgs they exist to stop. Navigation kept working as a side effect of that
 * lie; {@link getNavigationSaasFeatures} now provides that separately.
 *
 * - No subscription row: grandfathered org → full access.
 * - Active trial: the whole app, deliberately — that is what the trial is.
 * - Anything else, read-only included: the plan's real features.
 */
export async function getEffectiveSaasFeatures(orgId: string): Promise<SaasFeatures> {
  const state = await getOrgSubscriptionState(orgId)
  if (!state) return { ...parseSaasFeatures(null) }

  const trialPlan = await resolveTrialEntitlementPlan(state)
  if (trialPlan) return trialPlan.features

  return state.features
}

function isTrialActive(state: OrgSubscriptionState): boolean {
  return (
    state.status === 'trial' &&
    state.trialEndsAt != null &&
    new Date(state.trialEndsAt).getTime() > Date.now()
  )
}

/**
 * The plan row an active trial is entitled to, or null when the org is not on
 * an active trial.
 *
 * Note the fail-open: if TRIAL_ENTITLEMENT_PLAN does not resolve, callers fall
 * back to `parseSaasFeatures(null)` — which is DEFAULT_SAAS_FEATURES, i.e. every
 * flag true. That is deliberate (a trial that silently loses the product is a
 * worse business outcome than a generous one) but it is invisible, so it is
 * logged loudly. If this fires, a migration retired the plan this constant
 * names.
 */
async function resolveTrialEntitlementPlan(
  state: OrgSubscriptionState
): Promise<SaasPlanRow | null> {
  if (!isTrialActive(state)) return null

  const plan = await getSaasPlanByName(TRIAL_ENTITLEMENT_PLAN)
  if (!plan) {
    console.error('[saas] TRIAL_ENTITLEMENT_PLAN did not resolve — trials are ungated', {
      plan: TRIAL_ENTITLEMENT_PLAN,
    })
    return null
  }
  return plan
}

/**
 * The plan row that governs an org right now — quotas included.
 *
 * A trial resolves the trial-entitlement plan rather than the `free` row it
 * technically sits on. Features and quotas used to disagree here: the trial got
 * Advanced's features but `free`'s 50-student cap. Under seat pricing that
 * asymmetry is fatal — a trialling studio owner would be blocked on their
 * second teacher and could never see the product they are being sold.
 *
 * Returns null for grandfathered orgs (no subscription row), which enforce
 * nothing.
 */
export async function getEffectiveSaasPlan(orgId: string): Promise<SaasPlanRow | null> {
  const state = await getOrgSubscriptionState(orgId)
  if (!state) return null

  const trialPlan = await resolveTrialEntitlementPlan(state)
  if (trialPlan) return trialPlan

  return getSaasPlanById(state.planId)
}

/**
 * Features for rendering navigation, which is not the same question as
 * entitlement.
 *
 * `undefined` means "show every entry" ({@link filterNav} in
 * src/lib/navigation/registry.ts). A read-only org gets that: its owner has to
 * reach reports, homework and billing to read and export the data before the
 * account goes dormant, and hiding those screens would make the export we are
 * about to demand of them impossible to find. Writes stay blocked by
 * `assertOrgNotSaasReadOnly`, and feature gates by the honest function above.
 */
export async function getNavigationSaasFeatures(
  orgId: string
): Promise<SaasFeatures | undefined> {
  const state = await getOrgSubscriptionState(orgId)
  if (isOrgSaasReadOnly(state)) return undefined
  return getEffectiveSaasFeatures(orgId)
}

export function isTrialExpired(state: OrgSubscriptionState | null): boolean {
  if (!state || state.status !== 'trial' || !state.trialEndsAt) return false
  return new Date(state.trialEndsAt).getTime() <= Date.now()
}

/**
 * Days a lapsed subscription keeps working before it turns read-only.
 *
 * A renewal that failed is usually an expired card, not a decision to leave, and
 * the person who has to fix it is the same person the lock-out stops from
 * working. The window is what turns "your card bounced" into something a teacher
 * can resolve between lessons instead of an outage mid-week.
 */
export const PAST_DUE_GRACE_DAYS = 7

/**
 * True when the org may read its data but not change it.
 *
 * `past_due` and `cancelled` used to fall through to false, so the daily checker
 * (supabase/functions/saas-subscription-checker) moved subscriptions into those
 * states and nothing anywhere acted on them: a cancelled org kept full access
 * forever, and a lapsed one was never asked to pay again.
 */
export function isOrgSaasReadOnly(state: OrgSubscriptionState | null): boolean {
  if (!state) return false
  if (state.status === 'read_only') return true
  // The org asked to stop. Its data stays readable and exportable; nothing more.
  if (state.status === 'cancelled') return true
  if (state.status === 'past_due') return isPastDueGraceOver(state)
  if (state.planName === 'free' && state.status === 'trial' && isTrialExpired(state)) return true
  return false
}

export type OrgServiceState = 'active' | 'grace' | 'suspended' | 'dormant'

/**
 * Writes `organizations.service_state` outside the daily cron.
 *
 * The cron (supabase/functions/saas-subscription-checker) owns the downgrade
 * ladder. This exists for the one transition that must not wait for it:
 * a payment landing should turn the bot, the crons and the parent portal back
 * on immediately, not up to 24 hours later.
 */
export async function setOrgServiceState(
  orgId: string,
  state: OrgServiceState
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({ service_state: state, service_state_changed_at: new Date().toISOString() })
    .eq('id', orgId)
    .neq('service_state', state)

  if (error) {
    // Never fail an activation over this; the cron reconciles within a day.
    console.error('[saas] failed to write service_state', { orgId, state, error: error.message })
  }
}

/** Whether a `past_due` subscription has used up {@link PAST_DUE_GRACE_DAYS}. */
export function isPastDueGraceOver(state: OrgSubscriptionState): boolean {
  // No period end recorded — treat the grace as still running rather than
  // locking an org out on missing data.
  if (!state.currentPeriodEnd) return false
  const graceEnds =
    new Date(state.currentPeriodEnd).getTime() + PAST_DUE_GRACE_DAYS * 86_400_000
  return Date.now() > graceEnds
}

/** Days left in the past-due grace window, or null when it does not apply. */
export function pastDueGraceDaysLeft(state: OrgSubscriptionState | null): number | null {
  if (!state || state.status !== 'past_due' || !state.currentPeriodEnd) return null
  const graceEnds =
    new Date(state.currentPeriodEnd).getTime() + PAST_DUE_GRACE_DAYS * 86_400_000
  return Math.max(0, Math.ceil((graceEnds - Date.now()) / 86_400_000))
}

export async function assertOrgNotSaasReadOnly(orgId: string): Promise<void> {
  const state = await getOrgSubscriptionState(orgId)
  if (isOrgSaasReadOnly(state)) {
    throw new Error('SAAS_READ_ONLY')
  }
}

export async function listSaasInvoices(orgId: string) {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('saas_invoices')
    .select(
      'id, amount, currency, status, sumit_document_id, sumit_document_url, billing_period_start, billing_period_end, issued_at, created_at'
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  return data ?? []
}

export async function upsertTrialSubscription(orgId: string, planId: string): Promise<void> {
  const db = createServiceRoleClient()
  const trialEnds = new Date()
  trialEnds.setDate(trialEnds.getDate() + TRIAL_DAYS)

  const { error } = await db.from('organization_subscriptions').upsert(
    {
      organization_id: orgId,
      plan_id: planId,
      status: 'trial',
      billing_interval: 'monthly',
      trial_ends_at: trialEnds.toISOString(),
      current_period_start: new Date().toISOString(),
      current_period_end: trialEnds.toISOString(),
      pending_checkout_reference: null,
      // Starting a trial ends any checkout that was in flight, so the snapshot
      // it left behind must not survive to confuse a later revert.
      previous_status: null,
      previous_plan_id: null,
    },
    { onConflict: 'organization_id' }
  )

  if (error) throw new Error(error.message)
}

export async function upsertPendingPaymentSubscription(params: {
  orgId: string
  planId: string
  billingInterval: 'monthly' | 'yearly'
  checkoutReference: string
}): Promise<void> {
  const db = createServiceRoleClient()

  // Snapshot what this checkout is about to overwrite, so abandoning it can put
  // the org back exactly where it was. Without this the upsert below is lossy:
  // an active advanced customer who starts an upgrade and cancels has no
  // recorded plan or status to return to.
  const { data: existing } = await db
    .from('organization_subscriptions')
    .select('status, plan_id, trial_ends_at, previous_status, previous_plan_id')
    .eq('organization_id', params.orgId)
    .maybeSingle()

  // Restarting an abandoned checkout must not overwrite the snapshot with
  // 'pending_payment' — keep the one already held.
  const previousStatus =
    existing?.status === 'pending_payment' ? existing.previous_status : (existing?.status ?? null)
  const previousPlanId =
    existing?.status === 'pending_payment' ? existing.previous_plan_id : (existing?.plan_id ?? null)

  const { error } = await db.from('organization_subscriptions').upsert(
    {
      organization_id: params.orgId,
      plan_id: params.planId,
      status: 'pending_payment',
      billing_interval: params.billingInterval,
      pending_checkout_reference: params.checkoutReference,
      // A payment dated before this cannot activate the checkout — see
      // evaluateCheckoutBinding. Refreshed on every (re)start on purpose.
      pending_checkout_started_at: new Date().toISOString(),
      // An unfinished checkout must not consume a trial that is still running;
      // revertPendingCheckout restores the trial status from the snapshot.
      trial_ends_at: existing?.trial_ends_at ?? null,
      previous_status: previousStatus,
      previous_plan_id: previousPlanId,
    },
    { onConflict: 'organization_id' }
  )

  if (error) throw new Error(error.message)
}

/** Why an activation attempt did nothing. Callers log it; none of it reaches the browser. */
export type ActivationRefusal = 'no_pending_subscription' | CheckoutBindingRefusal

export type ActivationResult =
  | { activated: true }
  | { activated: false; reason: ActivationRefusal }

/**
 * One billing period after `from`.
 *
 * Luxon, not Date arithmetic: `setMonth(getMonth() + 1)` on the 31st of a
 * month lands in the month *after* next, because the intermediate date does not
 * exist and JS silently rolls it over — 31 Aug + 1 month gave 1 Oct, billing
 * the customer for two months and charging them for one. `setFullYear` has the
 * same hole on 29 February. Luxon clamps to the last valid day instead
 * (30 Sep, 28 Feb), which is what every payment processor does.
 */
function addBillingPeriod(from: Date, interval: 'monthly' | 'yearly'): Date {
  return DateTime.fromJSDate(from)
    .plus(interval === 'yearly' ? { years: 1 } : { months: 1 })
    .toJSDate()
}

/**
 * Turns a confirmed Sumit payment into an active subscription.
 *
 * The activation is a single conditional UPDATE matched on
 * (organization_id, status='pending_payment', pending_checkout_reference).
 * That one predicate is what makes this safe, and it replaced a version that
 * only checked "a row exists for this org":
 *
 *   - Replay. The callback is a GET page. Re-opening its URL used to extend the
 *     period by another month and insert another "paid" invoice row, every time.
 *     Now the first activation clears the status and nulls the reference, so
 *     every later attempt matches nothing.
 *   - Cross-org. A valid payment id belonging to a different org used to
 *     activate the caller's own subscription. The reference is a server-side
 *     crypto.randomUUID() stored per org, so another org's payment cannot match.
 *   - Underpayment. A ₪1 payment used to activate `advanced`. The confirmed
 *     amount is now compared against the plan price for the stored interval.
 *
 * `checkoutReference` is deliberately allowed to come from the caller (URL
 * param or webhook body): it is untrusted, but it must equal a value we
 * generated and stored, so trusting it is unnecessary.
 *
 * Returns a refusal rather than throwing — a refused activation is an expected
 * outcome (duplicate webhook, refreshed tab), not an error.
 */
export async function activateSubscriptionFromPayment(params: {
  orgId: string
  /** Must equal the org's stored pending_checkout_reference. */
  checkoutReference: string
  /** Confirmed amount from Sumit. Skipped when Sumit did not report one. */
  paidAmount?: number | null
  sumitCustomerId?: string | null
  sumitSubscriptionId?: string | null
  sumitPaymentToken?: string | null
  cardLastFour?: string | null
  cardExpiryMonth?: number | null
  cardExpiryYear?: number | null
  /** Sumit Payment.ID — recorded on the invoice so it can never pay twice. */
  sumitPaymentId?: string | null
  invoice?: {
    amount: number
    sumitDocumentId?: string | null
    sumitDocumentUrl?: string | null
    billingPeriodStart?: string | null
    billingPeriodEnd?: string | null
  }
}): Promise<ActivationResult> {
  const db = createServiceRoleClient()

  const { data: sub } = await db
    .from('organization_subscriptions')
    .select(
      'id, plan_id, billing_interval, pending_checkout_reference, status, sumit_customer_id, sumit_subscription_id, sumit_payment_token, card_last_four, card_expiry_month, card_expiry_year'
    )
    .eq('organization_id', params.orgId)
    .maybeSingle()

  if (!sub || sub.status !== 'pending_payment') {
    return { activated: false, reason: 'no_pending_subscription' }
  }
  if (!sub.pending_checkout_reference || sub.pending_checkout_reference !== params.checkoutReference) {
    return { activated: false, reason: 'reference_mismatch' }
  }

  const interval = (sub.billing_interval as 'monthly' | 'yearly') ?? 'monthly'
  const plan = await getSaasPlanById(sub.plan_id)

  if (params.paidAmount != null && plan) {
    const expected =
      interval === 'yearly' && plan.price_yearly != null ? plan.price_yearly : plan.price_monthly
    if (params.paidAmount + AMOUNT_TOLERANCE < expected) {
      return { activated: false, reason: 'amount_below_plan_price' }
    }
  }

  const periodStart = new Date()
  // Was always +1 month, so a customer paying the yearly price got 30 days.
  const periodEnd = addBillingPeriod(periodStart, interval)

  // Only a freshly supplied token needs encrypting; sub.sumit_payment_token is
  // already ciphertext and is carried across verbatim by the ?? chain below.
  const newPaymentToken = params.sumitPaymentToken
    ? encryptSaasPaymentToken(params.sumitPaymentToken)
    : null

  const { data: updated, error: upErr } = await db
    .from('organization_subscriptions')
    .update({
      status: 'active',
      // Keep what Sumit already holds for this org when the caller has nothing
      // newer. This used to write null, so a returning customer's second
      // checkout wiped the token the renewal charger needs.
      sumit_customer_id: params.sumitCustomerId ?? sub.sumit_customer_id ?? null,
      sumit_subscription_id: params.sumitSubscriptionId ?? sub.sumit_subscription_id ?? null,
      sumit_payment_token: newPaymentToken ?? sub.sumit_payment_token ?? null,
      card_last_four: params.cardLastFour ?? sub.card_last_four ?? null,
      card_expiry_month: params.cardExpiryMonth ?? sub.card_expiry_month ?? null,
      card_expiry_year: params.cardExpiryYear ?? sub.card_expiry_year ?? null,
      pending_checkout_reference: null,
      pending_checkout_started_at: null,
      trial_ends_at: null,
      previous_status: null,
      previous_plan_id: null,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      renewal_attempts: 0,
      next_renewal_attempt_at: null,
      last_renewal_attempt_at: null,
      last_renewal_error: null,
    })
    // Re-stating the guard inside the UPDATE closes the window between the read
    // above and the write: the redirect callback and the webhook can land at the
    // same moment, and without this both would see a pending row and activate.
    .eq('id', sub.id)
    .eq('status', 'pending_payment')
    .eq('pending_checkout_reference', params.checkoutReference)
    .select('id')

  if (upErr) throw new Error(upErr.message)
  if (!updated || updated.length === 0) {
    return { activated: false, reason: 'no_pending_subscription' }
  }

  if (params.invoice) {
    const { error: invErr } = await db.from('saas_invoices').insert({
      organization_id: params.orgId,
      subscription_id: sub.id,
      amount: params.invoice.amount,
      currency: 'ILS',
      status: 'paid',
      source: 'checkout',
      sumit_payment_id: params.sumitPaymentId ?? null,
      sumit_document_id: params.invoice.sumitDocumentId ?? null,
      sumit_document_url: params.invoice.sumitDocumentUrl ?? null,
      billing_period_start: params.invoice.billingPeriodStart ?? periodStart.toISOString(),
      billing_period_end: params.invoice.billingPeriodEnd ?? periodEnd.toISOString(),
      issued_at: new Date().toISOString(),
    })
    // A duplicate document or payment id means the invoice is already recorded
    // (unique indexes, migrations 20260829130100 and 20260902120000). The
    // subscription is active either way — never fail an activation over the
    // bookkeeping row.
    if (invErr && invErr.code !== '23505') {
      console.error('[saas] invoice insert failed after activation', {
        orgId: params.orgId,
        error: invErr.message,
      })
    }
  }

  // Turn the service back on now. A suspended org that just paid should not
  // watch its bot stay silent until the next cron run.
  await setOrgServiceState(params.orgId, 'active')

  return { activated: true }
}

/** Dev-only: mark pending subscription active without Sumit. */
export async function devMockActivatePendingSubscription(orgId: string): Promise<boolean> {
  if (process.env.SUMIT_CHECKOUT_MOCK !== '1') return false

  const db = createServiceRoleClient()
  const { data: sub } = await db
    .from('organization_subscriptions')
    .select('pending_checkout_reference')
    .eq('organization_id', orgId)
    .eq('status', 'pending_payment')
    .maybeSingle()

  if (!sub?.pending_checkout_reference) return false

  const result = await activateSubscriptionFromPayment({
    orgId,
    checkoutReference: sub.pending_checkout_reference,
    sumitCustomerId: 'dev-mock',
    sumitSubscriptionId: 'dev-mock',
    invoice: { amount: 0 },
  })
  return result.activated
}

/**
 * Abandons a checkout that was never paid.
 *
 * Both cancel actions used to DELETE the row. An org with no subscription row
 * is treated as grandfathered everywhere — getEffectiveSaasFeatures returns
 * DEFAULT_SAAS_FEATURES (every flag true) and requireQuotaCapacity returns
 * early — so "start checkout, then cancel" handed out the full product,
 * unlimited and permanently. Reverting to
 * a bounded state keeps the org inside the entitlement system.
 */
export async function revertPendingCheckout(orgId: string): Promise<void> {
  const db = createServiceRoleClient()

  const { data: sub } = await db
    .from('organization_subscriptions')
    .select('id, plan_id, previous_status, previous_plan_id')
    .eq('organization_id', orgId)
    .eq('status', 'pending_payment')
    .maybeSingle()

  if (!sub) return

  // Restore exactly what the org had before it started the checkout. Falling
  // back to free/read_only instead would silently downgrade a paying customer
  // who clicked upgrade and changed their mind.
  const freePlan = sub.previous_plan_id ? null : await getSaasPlanByName('free')

  const { error } = await db
    .from('organization_subscriptions')
    .update({
      status: sub.previous_status ?? 'read_only',
      plan_id: sub.previous_plan_id ?? freePlan?.id ?? sub.plan_id,
      pending_checkout_reference: null,
      pending_checkout_started_at: null,
      previous_status: null,
      previous_plan_id: null,
    })
    .eq('id', sub.id)

  if (error) throw new Error(error.message)
}

export async function markOrganizationOnboardingComplete(orgId: string): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('organizations')
    .update({ onboarding_completed: true })
    .eq('id', orgId)
  if (error) throw new Error(error.message)
}

/**
 * The org's current service level, straight from the denormalised column.
 *
 * Read path only — the ladder is owned by public.derive_service_state and
 * written by the saas-subscription-checker cron (and by the payment path, via
 * {@link setOrgServiceState}). Callers must not re-derive it.
 *
 * An unknown org reads as 'active': a missing row is not a reason to take a
 * studio offline.
 */
export async function getOrgServiceState(orgId: string): Promise<OrgServiceState> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('organizations')
    .select('service_state')
    .eq('id', orgId)
    .maybeSingle()

  return (data?.service_state as OrgServiceState | undefined) ?? 'active'
}

/** True when automations and the parent portal are switched off for this org. */
export function isServiceSuspended(state: OrgServiceState): boolean {
  return state === 'suspended' || state === 'dormant'
}
