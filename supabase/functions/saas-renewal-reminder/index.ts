/**
 * saas-renewal-reminder — Supabase Edge Function
 *
 * Trigger: scheduled cron, daily at 08:00 UTC (0 8 * * *)
 *
 * Algorithm:
 *   1. Find active subscriptions renewing in exactly 2 days
 *      (current_period_end BETWEEN now+1d AND now+3d)
 *   2. For each org, find the owner's phone from profiles
 *   3. Find the org's WhatsApp credentials
 *   4. Send a WhatsApp reminder to the owner
 *   5. Dedup via notification_log (type = 'saas_renewal_reminder')
 *
 * Step 5 is a claim, not a check. The original code did
 * SELECT -> send -> INSERT, so two overlapping runs (a schedule registered
 * twice, a retry, a deploy mid-run) both saw no row and both messaged the
 * owner. Every other sender in this directory already uses the atomic
 * insert-as-claim in ../_shared/notificationClaim.ts; this one now does too.
 *
 * Failures are isolated per org — one failure does not stop others.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCronRequest, getSupabaseSecretKey } from '../_shared/supabaseSecret.ts'
import { claimNotification, settleNotification } from '../_shared/notificationClaim.ts'
import { decryptToken } from '../_shared/crypto.ts'
import { sendTextMessage } from '../_shared/whatsapp.ts'
import { botString } from '../_shared/botStrings.ts'
import { parseAppLocale } from '../_shared/templates.ts'
import { reportEdgeError, serveWithErrorReporting } from '../_shared/telemetry.ts'

serveWithErrorReporting('saas-renewal-reminder', async (_req) => {
  const authError = authorizeCronRequest(_req)
  if (authError) return authError

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = getSupabaseSecretKey()
  const db = createClient(supabaseUrl, serviceRoleKey)

  const now = new Date()
  // Window: subscriptions renewing between 1 and 3 days from now (catches "2 days before")
  const windowStart = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString()
  const windowEnd   = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()

  const results = { sent: 0, skipped: 0, errors: 0 }

  // ── 1. Find active subscriptions renewing within the window ──────────────────
  const { data: subs, error: subsError } = await db
    .from('organization_subscriptions')
    .select('id, organization_id, current_period_end, billing_interval, plan_id')
    .eq('status', 'active')
    .eq('cancel_at_period_end', false)
    .gte('current_period_end', windowStart)
    .lte('current_period_end', windowEnd)

  if (subsError) {
    console.error('[saas-renewal-reminder] Failed to query subscriptions', { error: subsError.message })
    return new Response('error', { status: 500 })
  }

  if (!subs || subs.length === 0) {
    console.info('[saas-renewal-reminder] No renewals in window')
    return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  for (const sub of subs) {
    const orgId = sub.organization_id

    const dedupKey = `saas_renewal_reminder:${sub.id}:${sub.current_period_end?.slice(0, 10)}`

    try {
      // ── 2. Get owner phone ─────────────────────────────────────────────────
      const { data: owner } = await db
        .from('profiles')
        .select('phone')
        .eq('organization_id', orgId)
        .eq('role', 'owner')
        .eq('is_active', true)
        .maybeSingle()

      if (!owner?.phone) {
        console.warn('[saas-renewal-reminder] Owner has no phone — skipping', { orgId })
        results.skipped++
        continue
      }

      // ── 3. Get org WhatsApp credentials ────────────────────────────────────
      const { data: org } = await db
        .from('organizations')
        .select('name, whatsapp_phone_number_id, whatsapp_access_token, default_locale')
        .eq('id', orgId)
        .maybeSingle()

      if (!org?.whatsapp_phone_number_id || !org?.whatsapp_access_token) {
        console.warn('[saas-renewal-reminder] Org has no WhatsApp — skipping', { orgId })
        results.skipped++
        continue
      }

      // ── 4. Resolve plan display name ───────────────────────────────────────
      const { data: plan } = await db
        .from('saas_plans')
        .select('display_name_he, display_name_en')
        .eq('id', sub.plan_id)
        .maybeSingle()

      // Read by the org owner, so it follows the organization's language —
      // display_name_en exists on saas_plans and was previously ignored.
      const locale = parseAppLocale(org.default_locale)
      const planName = locale === 'en' ? plan?.display_name_en : plan?.display_name_he
      const planLabel = planName
        ? botString('renewal_plan_label', locale, { plan: planName })
        : botString('renewal_your_plan', locale)

      const renewalDate = sub.current_period_end
        ? new Date(sub.current_period_end).toLocaleDateString(
            locale === 'en' ? 'en-US' : 'he-IL',
            { day: 'numeric', month: 'long', year: 'numeric' }
          )
        : botString('soon', locale)

      const message = botString('renewal_message', locale, {
        plan: planLabel,
        date: renewalDate,
      })

      // ── 5. Claim the send ──────────────────────────────────────────────────
      // Last step before the message goes out, so nothing above can leave a
      // pending row behind. The insert is the lock: a concurrent run gets
      // 23505 and stands down rather than sending a second reminder.
      const claim = await claimNotification(db, {
        orgId,
        type: 'saas_renewal_reminder',
        entityId: dedupKey,
      })
      if (claim !== 'claimed') {
        // Already sent, in flight, or the ledger is unavailable. All three mean
        // "not ours to send" — a missed reminder beats a duplicate one.
        console.info('[saas-renewal-reminder] Not claimed — skipping', { orgId, dedupKey, claim })
        results.skipped++
        continue
      }

      // ── 6. Decrypt token and send WhatsApp ─────────────────────────────────
      const accessToken = await decryptToken(org.whatsapp_access_token)
      await sendTextMessage(owner.phone, message, accessToken, org.whatsapp_phone_number_id)

      // ── 7. Settle the claim ────────────────────────────────────────────────
      await settleNotification(db, {
        orgId,
        type: 'saas_renewal_reminder',
        entityId: dedupKey,
        status: 'sent',
        errorMessage: null,
      })

      console.info('[saas-renewal-reminder] Reminder sent', { orgId, renewalDate })
      results.sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[saas-renewal-reminder] Failed for org', { orgId, error: msg })

      // Settle the claim as failed so the next run may retake it. If the throw
      // happened before the claim there is no row and this updates nothing —
      // which is correct: nothing was sent and nothing is held.
      await settleNotification(db, {
        orgId,
        type: 'saas_renewal_reminder',
        entityId: dedupKey,
        status: 'failed',
        errorMessage: msg.slice(0, 500),
      })

      await reportEdgeError(db, {
        thrown: err,
        route: 'saas-renewal-reminder',
        organizationId: orgId,
      })

      results.errors++
    }
  }

  console.info('[saas-renewal-reminder] Run complete', results)
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
