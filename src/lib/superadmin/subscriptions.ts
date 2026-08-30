/**
 * Subscription operations an operator needs and could not do before.
 * Server-only; service-role client.
 *
 * Per /docs/sprint-34-scope.md § /admin/subscriptions.
 *
 * Until now the only write to `organization_subscriptions` from the whole admin
 * panel was the custom-plan inquiry resolver, which hardcoded the `custom` plan,
 * a monthly interval and a one-month period. Extending a trial, moving a tenant
 * between plans, or marking a failed renewal all meant hand-written SQL.
 *
 * Every function here records to admin_audit_log. That is the point of them
 * existing in one file rather than inline in the actions.
 */

import { DateTime } from 'luxon'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getSaasPlanById } from '@/lib/saas/plans'
import type { SaasSubscriptionStatus } from '@/lib/saas/types'
import { recordAdminAction } from './audit'

export type SubscriptionMutationResult =
  | { ok: true }
  | { ok: false; error: string }

/** Statuses an operator may set by hand. `trial` is deliberately absent:
 *  reopening a trial is `extendTrial`, which also moves the end date — setting
 *  the status alone would leave a trial with a date in the past. */
export const MANUAL_STATUSES: SaasSubscriptionStatus[] = [
  'active',
  'past_due',
  'pending_payment',
  'read_only',
  'cancelled',
]

async function getSubscription(orgId: string) {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('organization_subscriptions')
    .select('id, plan_id, status, billing_interval, trial_ends_at, current_period_end')
    .eq('organization_id', orgId)
    .maybeSingle()
  return data
}

export async function changePlan(params: {
  orgId: string
  planId: string
  billingInterval: 'monthly' | 'yearly'
  actorProfileId: string
}): Promise<SubscriptionMutationResult> {
  const { orgId, planId, billingInterval, actorProfileId } = params
  const db = createServiceRoleClient()

  const plan = await getSaasPlanById(planId)
  if (!plan) return { ok: false, error: 'PLAN_NOT_FOUND' }

  const existing = await getSubscription(orgId)
  const now = DateTime.utc()
  const periodEnd =
    billingInterval === 'yearly' ? now.plus({ years: 1 }) : now.plus({ months: 1 })

  // Upsert on organization_id, which is UNIQUE: an org that never picked a plan
  // (a grandfathered tenant) has no row at all, and granting it one is exactly
  // what this action is for.
  const { error } = await db.from('organization_subscriptions').upsert(
    {
      organization_id: orgId,
      plan_id: planId,
      billing_interval: billingInterval,
      status: 'active' satisfies SaasSubscriptionStatus,
      current_period_start: now.toISO(),
      current_period_end: periodEnd.toISO(),
      cancel_at_period_end: false,
      cancelled_at: null,
      updated_at: now.toISO(),
    },
    { onConflict: 'organization_id' }
  )

  if (error) return { ok: false, error: error.message }

  await recordAdminAction({
    actorProfileId,
    action: 'subscription.change_plan',
    targetType: 'organization_subscriptions',
    targetId: existing?.id,
    organizationId: orgId,
    metadata: {
      fromPlanId: existing?.plan_id ?? null,
      toPlanId: planId,
      planName: plan.name,
      billingInterval,
    },
  })

  return { ok: true }
}

export async function extendTrial(params: {
  orgId: string
  days: number
  actorProfileId: string
}): Promise<SubscriptionMutationResult> {
  const { orgId, days, actorProfileId } = params
  if (!Number.isFinite(days) || days <= 0 || days > 365) {
    return { ok: false, error: 'INVALID_DAYS' }
  }

  const db = createServiceRoleClient()
  const existing = await getSubscription(orgId)
  if (!existing) return { ok: false, error: 'NO_SUBSCRIPTION' }

  // Extend from today when the trial already lapsed, from its end date when it
  // has not. Adding to a past date would "extend" it into another past date.
  const now = DateTime.utc()
  const base =
    existing.trial_ends_at && DateTime.fromISO(existing.trial_ends_at) > now
      ? DateTime.fromISO(existing.trial_ends_at)
      : now
  const newEnd = base.plus({ days })

  const { error } = await db
    .from('organization_subscriptions')
    .update({
      status: 'trial' satisfies SaasSubscriptionStatus,
      trial_ends_at: newEnd.toISO(),
      updated_at: now.toISO(),
    })
    .eq('organization_id', orgId)

  if (error) return { ok: false, error: error.message }

  await recordAdminAction({
    actorProfileId,
    action: 'subscription.extend_trial',
    targetType: 'organization_subscriptions',
    targetId: existing.id,
    organizationId: orgId,
    metadata: { days, from: existing.trial_ends_at, to: newEnd.toISO() },
  })

  return { ok: true }
}

export async function setSubscriptionStatus(params: {
  orgId: string
  status: SaasSubscriptionStatus
  actorProfileId: string
}): Promise<SubscriptionMutationResult> {
  const { orgId, status, actorProfileId } = params
  if (!MANUAL_STATUSES.includes(status)) return { ok: false, error: 'INVALID_STATUS' }

  const db = createServiceRoleClient()
  const existing = await getSubscription(orgId)
  if (!existing) return { ok: false, error: 'NO_SUBSCRIPTION' }

  const now = DateTime.utc()
  const { error } = await db
    .from('organization_subscriptions')
    .update({
      status,
      // Setting `cancelled` by hand must also stamp the date, or the churn
      // metrics — which count on cancelled_at, not on status — never see it.
      cancelled_at: status === 'cancelled' ? now.toISO() : null,
      updated_at: now.toISO(),
    })
    .eq('organization_id', orgId)

  if (error) return { ok: false, error: error.message }

  await recordAdminAction({
    actorProfileId,
    action: 'subscription.set_status',
    targetType: 'organization_subscriptions',
    targetId: existing.id,
    organizationId: orgId,
    metadata: { from: existing.status, to: status },
  })

  return { ok: true }
}

export async function cancelSubscription(params: {
  orgId: string
  atPeriodEnd: boolean
  actorProfileId: string
}): Promise<SubscriptionMutationResult> {
  const { orgId, atPeriodEnd, actorProfileId } = params
  const db = createServiceRoleClient()
  const existing = await getSubscription(orgId)
  if (!existing) return { ok: false, error: 'NO_SUBSCRIPTION' }

  const now = DateTime.utc()
  const { error } = await db
    .from('organization_subscriptions')
    .update(
      atPeriodEnd
        ? { cancel_at_period_end: true, updated_at: now.toISO() }
        : {
            status: 'cancelled' satisfies SaasSubscriptionStatus,
            cancelled_at: now.toISO(),
            cancel_at_period_end: false,
            updated_at: now.toISO(),
          }
    )
    .eq('organization_id', orgId)

  if (error) return { ok: false, error: error.message }

  await recordAdminAction({
    actorProfileId,
    action: 'subscription.cancel',
    targetType: 'organization_subscriptions',
    targetId: existing.id,
    organizationId: orgId,
    metadata: { atPeriodEnd, periodEnd: existing.current_period_end },
  })

  return { ok: true }
}
