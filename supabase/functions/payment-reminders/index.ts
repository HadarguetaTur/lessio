/**
 * payment-reminders — Supabase Edge Function
 * Per /docs/sprint-12-scope.md § Story 4
 *
 * Trigger: scheduled cron, daily at 09:00 UTC (0 9 * * *)
 *
 * Algorithm:
 *   1. Fetch all orgs with reminders_enabled=true and a connected WhatsApp number
 *   2. For each org, find pending charges older than payment_reminder_days that have a payment_link
 *   3. For each charge, check notification_log (dedup — one reminder per charge)
 *   4. Fetch parent phone via charge.parent_id
 *   5. Send WhatsApp payment reminder
 *   6. Insert notification_log row (sent or failed)
 *
 * Only charges with a payment_link are included — charges without a link have no
 * actionable payment URL to send to the parent.
 *
 * Failures are isolated per org/charge.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptToken } from '../_shared/crypto.ts'
import { sendSmartMessage } from '../_shared/whatsapp.ts'
import { resolveTemplate } from '../_shared/templates.ts'
import { sendEmail } from '../_shared/email.ts'

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceRoleKey)

  // ── 1. Fetch orgs with reminders enabled + WhatsApp connected ────────────────
  // automation_dunning_enabled is OPT-IN (defaults false, Sprint 31): overdue-charge
  // nagging only runs for orgs that explicitly enabled it in /settings/whatsapp.
  const { data: orgs, error: orgsError } = await db
    .from('organizations')
    .select('id, payment_reminder_days, whatsapp_phone_number_id, whatsapp_access_token, email_notifications')
    .eq('reminders_enabled', true)
    .eq('automation_dunning_enabled', true)
    .not('whatsapp_phone_number_id', 'is', null)
    .not('whatsapp_access_token', 'is', null)

  if (orgsError) {
    console.error('[payment-reminders] Failed to fetch orgs', { error: orgsError.message })
    return new Response('error fetching orgs', { status: 500 })
  }

  if (!orgs || orgs.length === 0) {
    return new Response('no orgs to process', { status: 200 })
  }

  const now = new Date()

  for (const org of orgs) {
    try {
      await processOrg(db, org, now)
    } catch (err) {
      console.error('[payment-reminders] Unhandled error for org', {
        org_id: org.id,
        error: String(err),
      })
    }
  }

  return new Response('ok', { status: 200 })
})

// deno-lint-ignore no-explicit-any
async function processOrg(db: any, org: any, now: Date) {
  const reminderDays: number = org.payment_reminder_days ?? 7

  // Cutoff: charges created before this timestamp are eligible
  const cutoff = new Date(now.getTime() - reminderDays * 24 * 60 * 60 * 1000)

  // ── 2. Fetch eligible charges ──────────────────────────────────────────────
  const { data: charges, error: chargesError } = await db
    .from('charges')
    .select('id, amount, payment_link, parent:parents ( id, phone, email )')
    .eq('organization_id', org.id)
    .eq('status', 'pending')
    .not('payment_link', 'is', null)
    .lt('created_at', cutoff.toISOString())

  if (chargesError) {
    console.error('[payment-reminders] Failed to fetch charges', {
      org_id: org.id,
      error: chargesError.message,
    })
    return
  }

  if (!charges || charges.length === 0) return

  // ── Decrypt WhatsApp token once per org ─────────────────────────────────────
  let accessToken: string
  try {
    accessToken = await decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[payment-reminders] Token decryption failed', {
      org_id: org.id,
      error: String(err),
    })
    return
  }

  for (const charge of charges) {
    // ── 3. Check dedup log ────────────────────────────────────────────────────
    const { data: existing } = await db
      .from('notification_log')
      .select('id')
      .eq('organization_id', org.id)
      .eq('type', 'payment_reminder')
      .eq('entity_id', charge.id)
      .maybeSingle()

    if (existing) continue // already sent

    // ── 4. Resolve parent phone ───────────────────────────────────────────────
    const phone: string | null = charge.parent?.phone ?? null
    if (!phone) {
      console.warn('[payment-reminders] No parent phone for charge', {
        org_id: org.id,
        charge_id: charge.id,
      })
      await insertLog(db, org.id, charge.id, 'failed', 'No parent phone')
      continue
    }

    const amount = Number(charge.amount).toFixed(2)
    const message = await resolveTemplate(db, org.id, 'payment_reminder', {
      amount,
      payment_link: charge.payment_link ?? '',
    })

    // ── 5. Send WhatsApp message (session-window aware) ───────────────────────
    let sendError: string | null = null
    try {
      await sendSmartMessage(
        db,
        org.id,
        phone,
        accessToken,
        org.whatsapp_phone_number_id,
        'payment_reminder',
        message,
        [charge.parent?.full_name ?? '', amount]
      )
    } catch (err) {
      sendError = String(err)
      console.error('[payment-reminders] WhatsApp send failed', {
        org_id: org.id,
        charge_id: charge.id,
        error: sendError,
      })
    }

    // ── 5b. Send email if enabled (Sprint 25) ─────────────────────────────────
    const emailSettings = (org.email_notifications ?? {}) as Record<string, boolean>
    const parentEmail: string | null = charge.parent?.email ?? null
    if (emailSettings.payment_reminder && parentEmail) {
      await sendEmail({
        to: parentEmail,
        subject: `תזכורת תשלום — ₪${amount}`,
        html: `<p>תזכורת: יש לך חיוב פתוח בסך ₪${amount}.</p>${charge.payment_link ? `<p><a href="${charge.payment_link}">לחצו כאן לתשלום</a></p>` : ''}`,
      }).catch((err: unknown) => {
        console.error('[payment-reminders] Email send failed', { org_id: org.id, charge_id: charge.id, error: String(err) })
      })
    }

    // ── 6. Insert notification log ────────────────────────────────────────────
    await insertLog(
      db,
      org.id,
      charge.id,
      sendError ? 'failed' : 'sent',
      sendError ?? null
    )
  }
}

// deno-lint-ignore no-explicit-any
async function insertLog(
  db: any,
  orgId: string,
  chargeId: string,
  status: 'sent' | 'failed',
  errorMessage: string | null
) {
  const { error } = await db.from('notification_log').upsert(
    {
      organization_id: orgId,
      type: 'payment_reminder',
      entity_id: chargeId,
      status,
      error_message: errorMessage,
      sent_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,type,entity_id', ignoreDuplicates: false }
  )

  if (error) {
    console.error('[payment-reminders] Failed to insert notification_log', {
      org_id: orgId,
      charge_id: chargeId,
      error: error.message,
    })
  }
}
