/**
 * The SaaS renewal engine — charging the stored Sumit card each period, and
 * the dunning ladder when it declines.
 *
 * Renewal is self-managed rather than a Sumit standing order (docs/decisions.md
 * #34): the schedule, the retry policy and the switch between plans all live
 * here, where they can be tested and changed without touching Sumit's UI.
 *
 * Concurrency: a run claims rows through `claim_saas_renewals`, which stamps a
 * lease in the same statement it selects. Two overlapping runs therefore never
 * see the same subscription, and a run that dies mid-charge releases its rows
 * when the lease expires. Success and failure are each a single SQL function so
 * the subscription update and its invoice row cannot come apart.
 *
 * Money-safety rules followed throughout:
 *   - A technical failure (outage, malformed response) is NOT an attempt. Only
 *     Sumit actually declining the card counts against the retry budget.
 *   - The new period runs from the old period end, not from today, so a card
 *     that clears three days late does not buy three free days.
 *   - Nothing is charged for a subscription without a stored token; those are
 *     the checker's business.
 */

import { DateTime } from 'luxon'
import { notifySuperadmins } from '@/lib/notifications'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { paymentFailedEmail, paymentReceiptEmail } from '@/lib/email/templates/saas'
import { completeCheckoutReturn } from './checkoutReturn'
import { getSaasPlanById, type SaasPlanRow } from './plans'
import { sendOwnerEmailOnce } from './ownerNotify'
import { PAST_DUE_GRACE_DAYS } from './subscriptions'
import {
  SumitApiError,
  chargeSumitCustomer,
  getSumitPaymentMethodForCustomer,
  listSumitPayments,
} from './sumit'

/**
 * Days after the period end at which attempt N is made. A declined card is
 * usually a temporary state (expired, over limit, travel block), so the ladder
 * spans a week before the account is locked.
 */
export const RENEWAL_RETRY_OFFSETS_DAYS = [0, 3, 7] as const
export const RENEWAL_MAX_ATTEMPTS = RENEWAL_RETRY_OFFSETS_DAYS.length

/** How long a claimed row stays claimed. Longer than any single Sumit call. */
export const RENEWAL_CLAIM_LEASE = '20 minutes'

/** Subscriptions charged per run, so one run cannot exceed the route's budget. */
export const RENEWAL_BATCH_LIMIT = 50

/** How far back reconciliation looks for a checkout that never came back. */
export const RECONCILE_WINDOW_HOURS = 72
/** Checkouts younger than this are still in the customer's hands. */
export const RECONCILE_MIN_AGE_MINUTES = 60

/**
 * When to try again after the attempt that just failed, or null when the
 * budget is spent and the account is left to the grace window.
 */
export function nextRenewalAttemptAt(
  currentPeriodEnd: Date,
  attemptsAfterThisOne: number
): Date | null {
  const offset = RENEWAL_RETRY_OFFSETS_DAYS[attemptsAfterThisOne]
  if (offset == null) return null
  return DateTime.fromJSDate(currentPeriodEnd).plus({ days: offset }).toJSDate()
}

/** The price this subscription renews at — the plan row it holds, retired or not. */
export function renewalAmountFor(plan: SaasPlanRow, interval: 'monthly' | 'yearly'): number {
  return interval === 'yearly' && plan.price_yearly != null ? plan.price_yearly : plan.price_monthly
}

export interface RenewalRunSummary {
  claimed: number
  charged: number
  declined: number
  errored: number
  skipped: number
}

interface ClaimedSubscription {
  id: string
  organization_id: string
  plan_id: string
  billing_interval: string | null
  current_period_end: string | null
  renewal_attempts: number
  sumit_customer_id: string | null
  sumit_payment_token: string | null
  card_last_four: string | null
}

export async function runRenewalCharges(
  now: Date,
  opts?: { limit?: number; authoriseOnly?: boolean; orgId?: string }
): Promise<RenewalRunSummary> {
  const db = createServiceRoleClient()
  const summary: RenewalRunSummary = { claimed: 0, charged: 0, declined: 0, errored: 0, skipped: 0 }

  const { data: claimed, error } = await db.rpc('claim_saas_renewals', {
    p_now: now.toISOString(),
    p_lease: RENEWAL_CLAIM_LEASE,
    p_max_attempts: RENEWAL_MAX_ATTEMPTS,
    p_limit: opts?.limit ?? RENEWAL_BATCH_LIMIT,
  })

  if (error) {
    console.error('[saas/renewal] claim failed', { error: error.message })
    throw new Error(error.message)
  }

  const rows = ((claimed ?? []) as ClaimedSubscription[]).filter(
    (r) => !opts?.orgId || r.organization_id === opts.orgId
  )
  summary.claimed = rows.length

  for (const sub of rows) {
    try {
      const outcome = await chargeOneRenewal(sub, { authoriseOnly: opts?.authoriseOnly ?? false })
      summary[outcome]++
    } catch (e) {
      summary.errored++
      // A technical failure must not consume an attempt: the lease expires and
      // the next run picks the row up again unchanged.
      console.error('[saas/renewal] charge errored — attempt not counted', {
        orgId: sub.organization_id,
        subscriptionId: sub.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (summary.charged > 0 || summary.declined > 0) {
    // Reconcile service_state now: a successful late payment should turn the
    // bot back on immediately, and a first decline should start the grace clock.
    const { error: syncErr } = await db.rpc('sync_org_service_states')
    if (syncErr) console.error('[saas/renewal] service_state sync failed', { error: syncErr.message })
  }

  console.info('[saas/renewal] run complete', summary)
  return summary
}

async function chargeOneRenewal(
  sub: ClaimedSubscription,
  opts: { authoriseOnly: boolean }
): Promise<'charged' | 'declined' | 'skipped'> {
  const db = createServiceRoleClient()
  const interval = (sub.billing_interval as 'monthly' | 'yearly') ?? 'monthly'
  const plan = await getSaasPlanById(sub.plan_id)

  if (!plan || !sub.current_period_end || !sub.sumit_customer_id) {
    console.error('[saas/renewal] not chargeable — skipping', {
      orgId: sub.organization_id,
      hasPlan: Boolean(plan),
      hasPeriodEnd: Boolean(sub.current_period_end),
      hasCustomer: Boolean(sub.sumit_customer_id),
    })
    return 'skipped'
  }

  const amount = renewalAmountFor(plan, interval)
  const periodEnd = new Date(sub.current_period_end)
  const attemptNumber = sub.renewal_attempts + 1

  const { data: org } = await db
    .from('organizations')
    .select('default_locale')
    .eq('id', sub.organization_id)
    .maybeSingle()
  const locale = org?.default_locale === 'en' ? 'en' : 'he'
  const planLabel = locale === 'en' ? plan.display_name_en : plan.display_name_he

  const result = await chargeSumitCustomer({
    customerId: sub.sumit_customer_id,
    token: sub.sumit_payment_token,
    amount,
    description: `LESSIO ${planLabel}`,
    language: locale,
    authoriseOnly: opts.authoriseOnly,
    sendDocumentByEmail: !opts.authoriseOnly,
  })

  if (opts.authoriseOnly) {
    // Dry run: Sumit validated (or refused) the card and nothing was recorded.
    console.info('[saas/renewal] dry run', {
      orgId: sub.organization_id,
      ok: result.ok,
      reason: result.ok ? null : result.reason,
    })
    return result.ok ? 'charged' : 'declined'
  }

  if (!result.ok) {
    await recordDecline({ sub, plan, amount, periodEnd, attemptNumber, locale, reason: result.reason })
    return 'declined'
  }

  const { data: applied, error: successErr } = await db.rpc('record_saas_renewal_success', {
    p_subscription_id: sub.id,
    p_expected_period_end: sub.current_period_end,
    p_amount: amount,
    p_sumit_payment_id: result.payment.id,
    p_sumit_document_id: result.documentId,
    p_sumit_document_url: result.documentUrl,
    p_card_last_four: result.payment.last4 ?? sub.card_last_four,
    p_card_expiry_month: result.payment.expiryMonth,
    p_card_expiry_year: result.payment.expiryYear,
  })

  if (successErr) throw new Error(successErr.message)

  const row = (applied ?? [])[0] as
    | { organization_id: string; new_period_start: string; new_period_end: string }
    | undefined

  if (!row) {
    // The card was charged but the period had already moved — the guard in the
    // SQL function refused to advance it twice. Money moved without a matching
    // period extension, so this must be looked at by a human.
    console.error('[saas/renewal] CHARGED BUT NOT APPLIED — period already advanced', {
      orgId: sub.organization_id,
      subscriptionId: sub.id,
      paymentId: result.payment.id,
      amount,
    })
    await notifySuperadmins(
      'saas_renewal_failed',
      'Renewal charged but not applied',
      `Org ${sub.organization_id} · payment ${result.payment.id} · ₪${amount}. The period had already advanced; check for a duplicate charge.`,
      `/admin/orgs/${sub.organization_id}`
    )
    return 'charged'
  }

  void sendOwnerEmailOnce({
    orgId: sub.organization_id,
    logType: 'saas_lifecycle_email',
    dedupKey: `saas_receipt:${sub.id}:${row.new_period_start}`,
    build: (owner) =>
      paymentReceiptEmail(
        {
          orgName: owner.orgName,
          planName: (owner.locale === 'en' ? plan.display_name_en : plan.display_name_he) ?? plan.name,
          amount,
          periodStart: row.new_period_start,
          periodEnd: row.new_period_end,
          documentUrl: result.documentUrl,
          billingUrl: `${getShareableBaseUrl()}/account/billing`,
        },
        owner.locale
      ),
  })

  console.info('[saas/renewal] charged', {
    orgId: sub.organization_id,
    amount,
    paymentId: result.payment.id,
    periodEnd: row.new_period_end,
  })
  return 'charged'
}

async function recordDecline(p: {
  sub: ClaimedSubscription
  plan: SaasPlanRow
  amount: number
  periodEnd: Date
  attemptNumber: number
  locale: 'he' | 'en'
  reason: string
}): Promise<void> {
  const db = createServiceRoleClient()
  const nextAttempt = nextRenewalAttemptAt(p.periodEnd, p.attemptNumber)

  const { error } = await db.rpc('record_saas_renewal_failure', {
    p_subscription_id: p.sub.id,
    p_amount: p.amount,
    p_error: p.reason,
    p_sumit_payment_id: null,
    p_next_attempt_at: nextAttempt ? nextAttempt.toISOString() : null,
  })
  if (error) throw new Error(error.message)

  const graceEndsAt = DateTime.fromJSDate(p.periodEnd).plus({ days: PAST_DUE_GRACE_DAYS }).toISO()

  await sendOwnerEmailOnce({
    orgId: p.sub.organization_id,
    logType: 'saas_dunning',
    dedupKey: `saas_dunning:${p.sub.id}:${p.sub.current_period_end}:${p.attemptNumber}`,
    build: (owner) =>
      paymentFailedEmail(
        {
          orgName: owner.orgName,
          amount: p.amount,
          attempt: p.attemptNumber,
          maxAttempts: RENEWAL_MAX_ATTEMPTS,
          nextAttemptAt: nextAttempt ? nextAttempt.toISOString() : null,
          graceEndsAt,
          last4: p.sub.card_last_four,
          billingUrl: `${getShareableBaseUrl()}/account/billing?reason=past_due`,
        },
        owner.locale
      ),
  })

  console.warn('[saas/renewal] declined', {
    orgId: p.sub.organization_id,
    attempt: p.attemptNumber,
    reason: p.reason,
    nextAttempt: nextAttempt?.toISOString() ?? null,
  })

  await notifySuperadmins(
    'saas_renewal_failed',
    `Renewal declined (attempt ${p.attemptNumber}/${RENEWAL_MAX_ATTEMPTS})`,
    `Org ${p.sub.organization_id} · ₪${p.amount} · ${p.reason}`,
    `/admin/orgs/${p.sub.organization_id}`
  )
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

export interface ReconcileSummary {
  scanned: number
  activated: number
  refused: number
}

/**
 * Catches checkouts that were paid but never came back — the customer closed
 * the tab before Sumit's redirect, and the webhook (if any) did not fire.
 *
 * Sumit's payment records carry no external reference, so a payment is matched
 * to an org by its Sumit customer id: the checkout sets
 * `Customer.ExternalIdentifier = orgId`, so the customer can be looked up even
 * when the org has never completed a payment before. The binding rules in
 * `completeCheckoutReturn` still decide whether the match may activate.
 */
export async function reconcilePendingCheckouts(now: Date): Promise<ReconcileSummary> {
  const db = createServiceRoleClient()
  const summary: ReconcileSummary = { scanned: 0, activated: 0, refused: 0 }

  const windowStart = new Date(now.getTime() - RECONCILE_WINDOW_HOURS * 3_600_000)
  const maxStartedAt = new Date(now.getTime() - RECONCILE_MIN_AGE_MINUTES * 60_000)

  const { data: pending, error } = await db
    .from('organization_subscriptions')
    .select('id, organization_id, pending_checkout_reference, pending_checkout_started_at, sumit_customer_id')
    .eq('status', 'pending_payment')
    .not('pending_checkout_started_at', 'is', null)
    .gte('pending_checkout_started_at', windowStart.toISOString())
    .lte('pending_checkout_started_at', maxStartedAt.toISOString())

  if (error) {
    console.error('[saas/reconcile] query failed', { error: error.message })
    return summary
  }
  if (!pending || pending.length === 0) return summary

  summary.scanned = pending.length

  let payments: Awaited<ReturnType<typeof listSumitPayments>> = []
  try {
    payments = await listSumitPayments({ from: windowStart, to: now, validOnly: true })
  } catch (e) {
    console.error('[saas/reconcile] payment list failed', {
      error: e instanceof SumitApiError ? (e.userMessage ?? e.message) : String(e),
    })
    return summary
  }

  for (const sub of pending) {
    let customerId = sub.sumit_customer_id
    if (!customerId) {
      try {
        const saved = await getSumitPaymentMethodForCustomer({ externalIdentifier: sub.organization_id })
        customerId = saved?.customerId ?? null
      } catch (e) {
        console.error('[saas/reconcile] customer lookup failed', {
          orgId: sub.organization_id,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    if (!customerId) continue

    const startedAt = sub.pending_checkout_started_at ? Date.parse(sub.pending_checkout_started_at) : 0
    const candidates = payments
      .filter((p) => p.customerId === customerId)
      .filter((p) => {
        const paidAt = p.date ? Date.parse(p.date) : NaN
        return !Number.isFinite(paidAt) || paidAt >= startedAt - 4 * 3_600_000
      })
    if (candidates.length === 0) continue

    // Newest first: the payment most likely to belong to this checkout.
    candidates.sort((a, b) => Number(b.id) - Number(a.id))

    for (const payment of candidates) {
      const { outcome } = await completeCheckoutReturn({
        orgId: sub.organization_id,
        query: {
          paymentId: payment.id,
          customerId,
          externalIdentifier: sub.pending_checkout_reference,
          cancelled: false,
        },
        source: 'reconciliation',
      })
      if (outcome === 'activated' || outcome === 'already_active') {
        summary.activated++
        console.info('[saas/reconcile] recovered a paid checkout', {
          orgId: sub.organization_id,
          paymentId: payment.id,
        })
        break
      }
      if (outcome === 'refused') summary.refused++
    }
  }

  return summary
}
