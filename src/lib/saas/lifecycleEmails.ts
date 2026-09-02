/**
 * The emails an org owner gets about their own Lessio subscription.
 *
 * Until now there were none. A trial ended with no warning: the status flipped
 * to read_only overnight, the WhatsApp bot went quiet, and the first signal the
 * owner got was a banner the next time they happened to log in. The only
 * existing SaaS notification (the Deno saas-renewal-reminder) sends WhatsApp
 * through the org's *own* number — which a trialling org usually has not
 * connected yet, so it could never reach the people who most needed telling.
 *
 * Email is therefore the primary channel here and depends on nothing the org
 * has configured. The WhatsApp reminder stays as it is; this does not replace
 * it, and the two dedup separately.
 *
 * Sending is idempotent per (org, type, key) through notification_log, so
 * running this twice in a day sends nothing twice.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import {
  renewalUpcomingEmail,
  subscriptionCancelledEmail,
  trialEndedEmail,
  trialEndingEmail,
} from '@/lib/email/templates/saas'
import { getSaasPlanById } from './plans'
import { sendOwnerEmailOnce, type OwnerEmailOutcome } from './ownerNotify'

/** Days before trial end that get a warning. T0 is the day it lapsed. */
export const TRIAL_REMINDER_DAYS = [7, 3, 1] as const

/** Days before a renewal that get the heads-up email. */
export const RENEWAL_NOTICE_DAYS = 3

export interface LifecycleEmailSummary {
  trialEnding: number
  trialEnded: number
  renewalUpcoming: number
  cancelled: number
  skipped: number
}

function bump(summary: LifecycleEmailSummary, key: keyof LifecycleEmailSummary, outcome: OwnerEmailOutcome) {
  if (outcome === 'sent') summary[key]++
  else summary.skipped++
}

/** The UTC day boundaries `daysFromNow` away — a whole day, so a daily run cannot miss one. */
function dayWindow(now: Date, daysFromNow: number): { start: string; end: string } {
  const day = DateTime.fromJSDate(now, { zone: 'utc' }).plus({ days: daysFromNow })
  return { start: day.startOf('day').toISO()!, end: day.endOf('day').toISO()! }
}

export async function runLifecycleEmails(now: Date): Promise<LifecycleEmailSummary> {
  const db = createServiceRoleClient()
  const summary: LifecycleEmailSummary = {
    trialEnding: 0,
    trialEnded: 0,
    renewalUpcoming: 0,
    cancelled: 0,
    skipped: 0,
  }
  const billingUrl = `${getShareableBaseUrl()}/account/billing`

  // ── Trials ending in 7 / 3 / 1 days ────────────────────────────────────────
  for (const daysLeft of TRIAL_REMINDER_DAYS) {
    const { start, end } = dayWindow(now, daysLeft)
    const { data: trials, error } = await db
      .from('organization_subscriptions')
      .select('id, organization_id, plan_id, trial_ends_at')
      .eq('status', 'trial')
      .gte('trial_ends_at', start)
      .lte('trial_ends_at', end)

    if (error) {
      console.error('[saas/lifecycle] trial query failed', { daysLeft, error: error.message })
      continue
    }

    for (const sub of trials ?? []) {
      const plan = await getSaasPlanById(sub.plan_id)
      const outcome = await sendOwnerEmailOnce({
        orgId: sub.organization_id,
        logType: 'saas_trial_reminder',
        dedupKey: `saas_trial:${sub.id}:T-${daysLeft}`,
        build: (owner) =>
          trialEndingEmail(
            {
              orgName: owner.orgName,
              daysLeft,
              trialEndsAt: sub.trial_ends_at!,
              billingUrl,
            },
            owner.locale
          ),
      })
      void plan
      bump(summary, 'trialEnding', outcome)
    }
  }

  // ── Trials that lapsed yesterday ───────────────────────────────────────────
  // Yesterday rather than today: the checker flips the status at 00:00 UTC, so
  // by the time this runs at 08:00 the row is already read_only and its
  // trial_ends_at is in the past.
  {
    const { start, end } = dayWindow(now, -1)
    const { data: lapsed, error } = await db
      .from('organization_subscriptions')
      .select('id, organization_id, trial_ends_at')
      .in('status', ['trial', 'read_only'])
      .gte('trial_ends_at', start)
      .lte('trial_ends_at', end)

    if (error) {
      console.error('[saas/lifecycle] lapsed-trial query failed', { error: error.message })
    } else {
      for (const sub of lapsed ?? []) {
        const outcome = await sendOwnerEmailOnce({
          orgId: sub.organization_id,
          logType: 'saas_trial_reminder',
          dedupKey: `saas_trial:${sub.id}:T0`,
          build: (owner) => trialEndedEmail({ orgName: owner.orgName, billingUrl }, owner.locale),
        })
        bump(summary, 'trialEnded', outcome)
      }
    }
  }

  // ── Renewals coming up ─────────────────────────────────────────────────────
  {
    const { start, end } = dayWindow(now, RENEWAL_NOTICE_DAYS)
    const { data: renewing, error } = await db
      .from('organization_subscriptions')
      .select('id, organization_id, plan_id, billing_interval, current_period_end, card_last_four')
      .eq('status', 'active')
      .eq('cancel_at_period_end', false)
      .gte('current_period_end', start)
      .lte('current_period_end', end)

    if (error) {
      console.error('[saas/lifecycle] renewal query failed', { error: error.message })
    } else {
      for (const sub of renewing ?? []) {
        const plan = await getSaasPlanById(sub.plan_id)
        if (!plan) {
          summary.skipped++
          continue
        }
        const interval = (sub.billing_interval as 'monthly' | 'yearly') ?? 'monthly'
        const amount =
          interval === 'yearly' && plan.price_yearly != null ? plan.price_yearly : plan.price_monthly

        const outcome = await sendOwnerEmailOnce({
          orgId: sub.organization_id,
          logType: 'saas_renewal_reminder',
          dedupKey: `saas_renewal_email:${sub.id}:${sub.current_period_end}`,
          build: (owner) =>
            renewalUpcomingEmail(
              {
                orgName: owner.orgName,
                planName: (owner.locale === 'en' ? plan.display_name_en : plan.display_name_he) ?? plan.name,
                amount,
                renewsAt: sub.current_period_end!,
                last4: sub.card_last_four,
                billingUrl,
              },
              owner.locale
            ),
        })
        bump(summary, 'renewalUpcoming', outcome)
      }
    }
  }

  // ── Subscriptions that reached the end of a requested cancellation ─────────
  {
    const { start, end } = dayWindow(now, -1)
    const { data: cancelled, error } = await db
      .from('organization_subscriptions')
      .select('id, organization_id, current_period_end, cancelled_at')
      .eq('status', 'cancelled')
      .gte('cancelled_at', start)
      .lte('cancelled_at', end)

    if (error) {
      console.error('[saas/lifecycle] cancellation query failed', { error: error.message })
    } else {
      for (const sub of cancelled ?? []) {
        const outcome = await sendOwnerEmailOnce({
          orgId: sub.organization_id,
          logType: 'saas_lifecycle_email',
          dedupKey: `saas_cancelled:${sub.id}:${sub.cancelled_at}`,
          build: (owner) =>
            subscriptionCancelledEmail(
              { orgName: owner.orgName, endsAt: sub.current_period_end, billingUrl },
              owner.locale
            ),
        })
        bump(summary, 'cancelled', outcome)
      }
    }
  }

  console.info('[saas/lifecycle] run complete', summary)
  return summary
}
