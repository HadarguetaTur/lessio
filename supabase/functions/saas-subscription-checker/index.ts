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
 *
 * Failures are logged but do not crash the function.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceRoleKey)

  const now = new Date().toISOString()
  const results = { trialExpired: 0, cancelledAtPeriodEnd: 0, pastDue: 0, errors: 0 }

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

  console.info('[saas-checker] Run complete', results)
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
