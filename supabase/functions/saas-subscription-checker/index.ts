/**
 * saas-subscription-checker — Supabase Edge Function
 *
 * Trigger: scheduled cron, daily at 00:00 UTC (0 0 * * *)
 *
 * Algorithm:
 *   0. Abandon checkouts started more than 72h ago and never paid
 *   1. Find trial subscriptions where trial_ends_at < now → set status = 'read_only'
 *   2. Find active/past_due subscriptions where current_period_end < now
 *      and cancel_at_period_end = true → set status = 'cancelled'
 *   3. Find active subscriptions whose period ended and that the renewal
 *      charger cannot rescue → set status = 'past_due'. Charging is owned by
 *      /api/internal/saas/renew (Next.js — it holds the Sumit adapter), so a
 *      subscription with a stored token is left alone for two days before this
 *      steps in; that only happens if the charger stopped running.
 *   4. Derive organizations.service_state from the subscription — the single
 *      value the WhatsApp webhook, the sending crons and the parent portal read
 *      to decide whether an org's service is on. This function is its ONLY
 *      scheduled writer; the payment path also writes 'active' directly so
 *      reactivation is instant instead of waiting for tomorrow's run.
 *
 * Failures are logged but do not crash the function.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCronRequest, getSupabaseSecretKey } from '../_shared/supabaseSecret.ts'
import { serveWithErrorReporting } from '../_shared/telemetry.ts'

serveWithErrorReporting('saas-subscription-checker', async (_req) => {
  const authError = authorizeCronRequest(_req)
  if (authError) return authError

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = getSupabaseSecretKey()
  const db = createClient(supabaseUrl, serviceRoleKey)

  const now = new Date().toISOString()
  const results = {
    staleCheckouts: 0,
    trialExpired: 0,
    cancelledAtPeriodEnd: 0,
    pastDue: 0,
    serviceStateChanged: 0,
    errors: 0,
  }

  // ── 0. Abandon checkouts that were never paid ───────────────────────────────
  // A row left in pending_payment is invisible to every other pass here, and to
  // the renewal charger. Reconciliation (in the Next.js cron) has had three days
  // to find a real payment for it by now.
  const staleBefore = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
  const { data: stale, error: staleErr } = await db
    .from('organization_subscriptions')
    .select('id, organization_id, previous_status, previous_plan_id')
    .eq('status', 'pending_payment')
    .not('pending_checkout_started_at', 'is', null)
    .lt('pending_checkout_started_at', staleBefore)

  if (staleErr) {
    console.error('[saas-checker] Failed to query stale checkouts', { error: staleErr.message })
    results.errors++
  } else {
    for (const sub of stale ?? []) {
      // Restore what the org had before the checkout. Never delete the row: an
      // org with no subscription reads as grandfathered and gets everything free.
      const update: Record<string, unknown> = {
        status: sub.previous_status ?? 'read_only',
        pending_checkout_reference: null,
        pending_checkout_started_at: null,
        previous_status: null,
        previous_plan_id: null,
        updated_at: now,
      }
      if (sub.previous_plan_id) update.plan_id = sub.previous_plan_id

      const { error } = await db.from('organization_subscriptions').update(update).eq('id', sub.id)

      if (error) {
        console.error('[saas-checker] Failed to abandon stale checkout', { subId: sub.id, error: error.message })
        results.errors++
      } else {
        console.info('[saas-checker] Stale checkout abandoned', { subId: sub.id, orgId: sub.organization_id })
        results.staleCheckouts++
      }
    }
  }

  // ── 1. Expire free trials ───────────────────────────────────────────────────
  const { data: expiredTrials, error: trialErr } = await db
    .from('organization_subscriptions')
    .select('id, organization_id')
    .eq('status', 'trial')
    .lt('trial_ends_at', now)

  if (trialErr) {
    console.error('[saas-checker] Failed to query expired trials', { error: trialErr.message })
    results.errors++
  } else {
    for (const sub of expiredTrials ?? []) {
      const { error } = await db
        .from('organization_subscriptions')
        .update({ status: 'read_only', updated_at: now })
        .eq('id', sub.id)

      if (error) {
        console.error('[saas-checker] Failed to expire trial', { subId: sub.id, orgId: sub.organization_id, error: error.message })
        results.errors++
      } else {
        console.info('[saas-checker] Trial expired → read_only', { subId: sub.id, orgId: sub.organization_id })
        results.trialExpired++
      }
    }
  }

  // ── 2. Cancel subscriptions that reached period_end with cancel_at_period_end ─
  const { data: toCancel, error: cancelErr } = await db
    .from('organization_subscriptions')
    .select('id, organization_id')
    .in('status', ['active', 'past_due'])
    .eq('cancel_at_period_end', true)
    .lt('current_period_end', now)

  if (cancelErr) {
    console.error('[saas-checker] Failed to query cancellations', { error: cancelErr.message })
    results.errors++
  } else {
    for (const sub of toCancel ?? []) {
      const { error } = await db
        .from('organization_subscriptions')
        // cancelled_at was never stamped here, so every self-serve cancellation
        // was invisible to churn metrics keyed on it (the superadmin path does
        // stamp it — src/lib/superadmin/subscriptions.ts).
        .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
        .eq('id', sub.id)

      if (error) {
        console.error('[saas-checker] Failed to cancel subscription', { subId: sub.id, orgId: sub.organization_id, error: error.message })
        results.errors++
      } else {
        console.info('[saas-checker] Subscription cancelled at period end', { subId: sub.id, orgId: sub.organization_id })
        results.cancelledAtPeriodEnd++
      }
    }
  }

  // ── 3. Mark overdue active subscriptions as past_due ───────────────────────
  //
  // The renewal charger owns the normal path: it charges the stored token and
  // sets past_due itself on a decline, with the dunning emails attached. This
  // pass must not race it — flipping a subscription the charger is about to
  // rescue would send a customer a lock-out warning for a card that works.
  //
  // So: a subscription WITH a token is left alone for two days. If it is still
  // overdue after that, the charger is not running, which is an incident.
  // A subscription with no token can only be handled here.
  const chargerGraceCutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: overdue, error: overdueErr } = await db
    .from('organization_subscriptions')
    .select('id, organization_id, sumit_payment_token, current_period_end')
    .eq('status', 'active')
    .eq('cancel_at_period_end', false)
    .lt('current_period_end', now)

  if (overdueErr) {
    console.error('[saas-checker] Failed to query overdue subs', { error: overdueErr.message })
    results.errors++
  } else {
    for (const sub of overdue ?? []) {
      const hasToken = Boolean(sub.sumit_payment_token)
      const chargerHadItsChance = (sub.current_period_end ?? now) < chargerGraceCutoff
      if (hasToken && !chargerHadItsChance) continue

      const { error } = await db
        .from('organization_subscriptions')
        .update({ status: 'past_due', updated_at: now })
        .eq('id', sub.id)
        // Do not overwrite a status the charger changed while we were working.
        .eq('status', 'active')

      if (error) {
        console.error('[saas-checker] Failed to mark past_due', { subId: sub.id, orgId: sub.organization_id, error: error.message })
        results.errors++
      } else if (hasToken) {
        console.error('[saas-checker] Overdue 2+ days WITH a stored card — is the renewal charger running?', {
          subId: sub.id,
          orgId: sub.organization_id,
          periodEnd: sub.current_period_end,
        })
        results.pastDue++
      } else {
        console.info('[saas-checker] Overdue subscription with no stored card → past_due', {
          subId: sub.id,
          orgId: sub.organization_id,
        })
        results.pastDue++
      }
    }
  }

  // ── 4. Derive service_state for every org that has a subscription ──────────
  // Runs last so it sees the statuses the three passes above just wrote.
  //
  // The ladder itself is public.derive_service_state (migration
  // 20260829140100), not code here: nothing in this repo can unit-test a Deno
  // Edge Function — vitest only collects src/** — and this decides whether a
  // studio's bot and parent portal are switched off. In SQL it has one
  // definition and can be checked with a SELECT against real data.
  const { data: changes, error: syncErr } = await db.rpc('sync_org_service_states')

  if (syncErr) {
    console.error('[saas-checker] service_state sync failed', { error: syncErr.message })
    results.errors++
  } else {
    for (const c of changes ?? []) {
      console.info('[saas-checker] service_state changed', {
        orgId: c.organization_id,
        from: c.from_state,
        to: c.to_state,
      })
    }
    results.serviceStateChanged = changes?.length ?? 0
  }

  console.info('[saas-checker] Run complete', results)
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
