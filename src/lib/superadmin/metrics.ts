/**
 * Platform SaaS metrics — Lessio's own numbers, not its tenants'.
 * Server-only; service-role client.
 *
 * Per /docs/sprint-34-scope.md § אפיון מסכים.
 *
 * The dashboard this replaces reported tenant revenue (a sum over `charges`,
 * which is a teacher billing a parent) under the label "revenue". None of the
 * platform's own numbers — MRR, churn, trial conversion — were computed
 * anywhere. They all live in `organization_subscriptions` joined to
 * `saas_plans`, which is one row per tenant and therefore cheap to fold in JS.
 * The queries that genuinely could not stay in JS (last activity, per-org
 * usage) became views in 20260830210000_platform_admin_console.sql.
 */

import { DateTime } from 'luxon'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SaasPlanName, SaasSubscriptionStatus } from '@/lib/saas/types'

/** Statuses that are paying us, or are meant to be. `past_due` still counts:
 *  a failed renewal is usually an expired card, not a decision to leave, and
 *  dropping it from MRR would make every card failure look like churn. */
const REVENUE_STATUSES: SaasSubscriptionStatus[] = ['active', 'past_due']

export type SubscriptionRow = {
  id: string
  organizationId: string
  organizationName: string
  planId: string
  planName: SaasPlanName
  planLabelHe: string
  planLabelEn: string
  status: SaasSubscriptionStatus
  billingInterval: 'monthly' | 'yearly'
  /** Normalised to a monthly figure regardless of billing interval. */
  monthlyValue: number
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  cancelledAt: string | null
  cardLastFour: string | null
  createdAt: string
}

export type SaasMetrics = {
  mrr: number
  arr: number
  payingOrgs: number
  arpa: number
  /** MRR from subscriptions that started paying this month. */
  newMrrThisMonth: number
  /** MRR lost to cancellations this month. */
  churnedMrrThisMonth: number
  /** newMrrThisMonth − churnedMrrThisMonth. Expansion and contraction are not
   *  included: nothing records plan-change history yet, so a number claiming to
   *  cover them would be a guess. */
  netNewMrrThisMonth: number
  activeTrials: number
  trialsEndingWithin7Days: number
  /** Of trials started in the 90 days before this month, the share now paying. */
  trialConversionRate: number | null
  trialConversionSample: number
  /** Cancellations this month ÷ paying at the start of it. */
  customerChurnRate: number | null
  cancelledThisMonth: number
}

/** Monthly-normalised value of one subscription. A yearly plan with no yearly
 *  price falls back to the monthly one rather than silently contributing 0. */
function monthlyValueOf(
  interval: string,
  priceMonthly: number,
  priceYearly: number | null
): number {
  if (interval === 'yearly') {
    return priceYearly != null ? priceYearly / 12 : priceMonthly
  }
  return priceMonthly
}

type RawSubscriptionRow = {
  id: string
  organization_id: string
  plan_id: string
  status: string
  billing_interval: string
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  card_last_four: string | null
  created_at: string
  organizations: { name: string } | null
  saas_plans: {
    name: string
    display_name_he: string
    display_name_en: string
    price_monthly: number | string
    price_yearly: number | string | null
  } | null
}

/**
 * Every subscription with its plan and org name, normalised.
 *
 * One row per tenant — this is the small table the whole revenue picture is
 * built from, so it is fetched once and shared by the metrics, the
 * subscriptions screen and the orgs list rather than re-queried per caller.
 */
export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('organization_subscriptions')
    .select(
      `id, organization_id, plan_id, status, billing_interval, trial_ends_at,
       current_period_end, cancel_at_period_end, cancelled_at, card_last_four, created_at,
       organizations ( name ),
       saas_plans ( name, display_name_he, display_name_en, price_monthly, price_yearly )`
    )
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as unknown as RawSubscriptionRow[]).map((r) => {
    const priceMonthly = Number(r.saas_plans?.price_monthly ?? 0)
    const priceYearly =
      r.saas_plans?.price_yearly != null ? Number(r.saas_plans.price_yearly) : null

    return {
      id: r.id,
      organizationId: r.organization_id,
      organizationName: r.organizations?.name ?? '—',
      planId: r.plan_id,
      planName: (r.saas_plans?.name ?? 'free') as SaasPlanName,
      planLabelHe: r.saas_plans?.display_name_he ?? '—',
      planLabelEn: r.saas_plans?.display_name_en ?? '—',
      status: r.status as SaasSubscriptionStatus,
      billingInterval: r.billing_interval as 'monthly' | 'yearly',
      monthlyValue: monthlyValueOf(r.billing_interval, priceMonthly, priceYearly),
      trialEndsAt: r.trial_ends_at,
      currentPeriodEnd: r.current_period_end,
      cancelAtPeriodEnd: r.cancel_at_period_end,
      cancelledAt: r.cancelled_at,
      cardLastFour: r.card_last_four,
      createdAt: r.created_at,
    }
  })
}

export function computeSaasMetrics(
  subs: SubscriptionRow[],
  now: DateTime = DateTime.utc()
): SaasMetrics {
  const monthStart = now.startOf('month')
  const sevenDaysOut = now.plus({ days: 7 })
  const ninetyDaysBeforeMonth = monthStart.minus({ days: 90 })

  const paying = subs.filter((s) => REVENUE_STATUSES.includes(s.status))
  const mrr = paying.reduce((sum, s) => sum + s.monthlyValue, 0)

  const trials = subs.filter(
    (s) =>
      s.status === 'trial' &&
      s.trialEndsAt != null &&
      DateTime.fromISO(s.trialEndsAt) > now
  )
  const trialsEndingWithin7Days = trials.filter(
    (s) => DateTime.fromISO(s.trialEndsAt!) <= sevenDaysOut
  ).length

  // Started paying this month: a subscription is created in `trial` or
  // `pending_payment`, so "new" is one that is paying now and was created this
  // month. Conversions from an older trial are counted by trialConversionRate,
  // not here — this is the cash that appeared this month.
  const newThisMonth = paying.filter(
    (s) => DateTime.fromISO(s.createdAt) >= monthStart
  )
  const newMrrThisMonth = newThisMonth.reduce((sum, s) => sum + s.monthlyValue, 0)

  const cancelledThisMonthRows = subs.filter(
    (s) => s.cancelledAt != null && DateTime.fromISO(s.cancelledAt) >= monthStart
  )
  const churnedMrrThisMonth = cancelledThisMonthRows.reduce(
    (sum, s) => sum + s.monthlyValue,
    0
  )

  // Trials that started in the 90 days before this month have had time to
  // decide; ones started this month have not, and including them would drag
  // the rate down every time marketing works.
  const matureTrials = subs.filter((s) => {
    const created = DateTime.fromISO(s.createdAt)
    return created >= ninetyDaysBeforeMonth && created < monthStart
  })
  const convertedTrials = matureTrials.filter((s) =>
    REVENUE_STATUSES.includes(s.status)
  )

  // Denominator is everyone who was paying when the month opened: those still
  // paying plus those who left during it, minus those who only joined in it.
  const payingAtMonthStart =
    paying.filter((s) => DateTime.fromISO(s.createdAt) < monthStart).length +
    cancelledThisMonthRows.length

  return {
    mrr,
    arr: mrr * 12,
    payingOrgs: paying.length,
    arpa: paying.length > 0 ? mrr / paying.length : 0,
    newMrrThisMonth,
    churnedMrrThisMonth,
    netNewMrrThisMonth: newMrrThisMonth - churnedMrrThisMonth,
    activeTrials: trials.length,
    trialsEndingWithin7Days,
    trialConversionRate:
      matureTrials.length > 0 ? convertedTrials.length / matureTrials.length : null,
    trialConversionSample: matureTrials.length,
    customerChurnRate:
      payingAtMonthStart > 0 ? cancelledThisMonthRows.length / payingAtMonthStart : null,
    cancelledThisMonth: cancelledThisMonthRows.length,
  }
}

export async function getSaasMetrics(): Promise<{
  metrics: SaasMetrics
  subscriptions: SubscriptionRow[]
}> {
  const subscriptions = await listSubscriptions()
  return { metrics: computeSaasMetrics(subscriptions), subscriptions }
}

// ── activation funnel ────────────────────────────────────────────────────────

export type FunnelStage = {
  key: 'signup' | 'onboarded' | 'firstLesson' | 'firstCharge' | 'firstPayment'
  count: number
  /** Share of the cohort that reached this stage. 1 for the first stage. */
  rate: number
}

/**
 * How far the orgs that signed up in the window got.
 *
 * Bounded by the cohort, not by table size: the org ids come first, and every
 * later query is scoped to them. A 30-day cohort is a handful of tenants even
 * at scale, which is what makes this safe to run on a page load.
 */
export async function getActivationFunnel(days = 30): Promise<FunnelStage[]> {
  const db = createServiceRoleClient()
  const since = DateTime.utc().minus({ days }).toISO()!

  const { data: orgs } = await db
    .from('organizations')
    .select('id, onboarding_completed')
    .gte('created_at', since)

  const cohort = orgs ?? []
  const ids = cohort.map((o) => o.id)

  if (ids.length === 0) {
    return (
      ['signup', 'onboarded', 'firstLesson', 'firstCharge', 'firstPayment'] as const
    ).map((key) => ({ key, count: 0, rate: 0 }))
  }

  const [lessonsRes, chargesRes, paidRes] = await Promise.all([
    db.from('lessons').select('organization_id').in('organization_id', ids),
    db.from('charges').select('organization_id').in('organization_id', ids),
    db
      .from('charges')
      .select('organization_id')
      .in('organization_id', ids)
      .eq('status', 'paid'),
  ])

  const distinct = (rows: { organization_id: string }[] | null) =>
    new Set((rows ?? []).map((r) => r.organization_id)).size

  const signup = cohort.length
  const stages: FunnelStage[] = [
    { key: 'signup', count: signup, rate: 1 },
    {
      key: 'onboarded',
      count: cohort.filter((o) => o.onboarding_completed).length,
      rate: 0,
    },
    { key: 'firstLesson', count: distinct(lessonsRes.data), rate: 0 },
    { key: 'firstCharge', count: distinct(chargesRes.data), rate: 0 },
    { key: 'firstPayment', count: distinct(paidRes.data), rate: 0 },
  ]

  return stages.map((s) => ({ ...s, rate: signup > 0 ? s.count / signup : 0 }))
}
