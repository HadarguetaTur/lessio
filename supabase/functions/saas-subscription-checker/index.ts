/**
 * saas-subscription-checker — Supabase Edge Function
 *
 * Trigger: scheduled cron, daily at 00:00 UTC (0 0 * * *)
 *
 * Algorithm:
 *   1. Find trial subscriptions where trial_ends_at < now → set status = 'read_only'
 *   2. Find active/past_due subscriptions where current_period_end < now
 *      and cancel_at_period_end = true → set status = 'cancelled'
 *   3. Find active subscriptions where current_period_end < now
 *      and cancel_at_period_end = false → set status = 'past_due'
 *      (actual renewal is handled by Sumit webhooks; this is a safety net)
 *   4. Derive organizations.service_state from the subscription — the single
 *      value the WhatsApp webhook, the sending crons and the parent portal read
 *      to decide whether an org's service is on. This function is its ONLY
 *      scheduled writer; the payment path also writes 'active' directly so
 *      reactivation is instant instead of waiting for tomorrow's run.
 *
 * Failures are logged but do not crash the function.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceRoleKey)

  const now = new Date().toISOString()
  const results = {
    trialExpired: 0,
    cancelledAtPeriodEnd: 0,
    pastDue: 0,
    serviceStateChanged: 0,
    errors: 0,
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
        .update({ status: 'cancelled', updated_at: now })
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
  // (Sumit handles actual renewal; this catches cases where the webhook was missed)
  const { data: overdue, error: overdueErr } = await db
    .from('organization_subscriptions')
    .select('id, organization_id')
    .eq('status', 'active')
    .eq('cancel_at_period_end', false)
    .lt('current_period_end', now)

  if (overdueErr) {
    console.error('[saas-checker] Failed to query overdue subs', { error: overdueErr.message })
    results.errors++
  } else {
    for (const sub of overdue ?? []) {
      const { error } = await db
        .from('organization_subscriptions')
        .update({ status: 'past_due', updated_at: now })
        .eq('id', sub.id)

      if (error) {
        console.error('[saas-checker] Failed to mark past_due', { subId: sub.id, orgId: sub.organization_id, error: error.message })
        results.errors++
      } else {
        console.info('[saas-checker] Active subscription past_due (missed renewal?)', { subId: sub.id, orgId: sub.organization_id })
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
