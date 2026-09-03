/**
 * data-retention — Supabase Edge Function
 * Per /docs/sprint-23-scope.md § Story 1c
 *
 * Trigger: daily cron at 03:00 UTC
 *
 * Algorithm:
 *   1. Fetch all orgs with data_retention_days IS NOT NULL
 *   2. For each org, anonymise:
 *      a. conversation_log rows older than retention window:
 *         phone → '***', content → '[anonymised]'
 *      a'. leads.raw_message → '[anonymised]' for rows older than retention window
 *      b. whatsapp_processed_messages.phone → '***' for rows older than retention window
 *      c. whatsapp_messages: phone → '***', body → '[anonymised]'
 *   3. Failures are isolated per org
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCronRequest, getSupabaseSecretKey } from '../_shared/supabaseSecret.ts'

Deno.serve(async (_req) => {
  const authError = authorizeCronRequest(_req)
  if (authError) return authError

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = getSupabaseSecretKey()
  const db = createClient(supabaseUrl, serviceRoleKey)

  // ── 1. Fetch orgs with an active retention policy ────────────────────────
  const { data: orgs, error: orgsError } = await db
    .from('organizations')
    .select('id, data_retention_days')
    .not('data_retention_days', 'is', null)

  if (orgsError) {
    console.error('[data-retention] Failed to fetch orgs', { error: orgsError.message })
    return new Response('error fetching orgs', { status: 500 })
  }

  if (!orgs || orgs.length === 0) {
    return new Response('no orgs with retention policy', { status: 200 })
  }

  let processed = 0
  let errors = 0

  for (const org of orgs) {
    try {
      await processOrg(db, org.id, org.data_retention_days as number)
      processed++
    } catch (err) {
      errors++
      console.error('[data-retention] Error processing org', {
        org_id: org.id,
        error: String(err),
      })
    }
  }

  console.info('[data-retention] Completed', { processed, errors })
  return new Response(JSON.stringify({ processed, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// deno-lint-ignore no-explicit-any
async function processOrg(db: any, orgId: string, retentionDays: number) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  const cutoffIso = cutoff.toISOString()

  // ── 2a. Anonymise conversation_log ───────────────────────────────────────
  // Columns are phone / role / content (supabase/migrations/20260418000001_ai_assistant.sql).
  // An earlier version targeted user_phone / message / response, which never
  // existed — the update errored on every run and no conversation was ever
  // anonymised.
  const { error: convErr } = await db
    .from('conversation_log')
    .update({
      phone: '***',
      content: '[anonymised]',
    })
    .eq('organization_id', orgId)
    .lt('created_at', cutoffIso)
    .neq('phone', '***') // skip already-anonymised rows

  if (convErr) {
    console.error('[data-retention] conversation_log update failed', {
      org_id: orgId,
      error: convErr.message,
    })
  }

  // ── 2a'. Anonymise the first message strangers sent (leads.raw_message) ──
  const { error: leadErr } = await db
    .from('leads')
    .update({ raw_message: '[anonymised]' })
    .eq('organization_id', orgId)
    .lt('created_at', cutoffIso)
    .not('raw_message', 'is', null)
    .neq('raw_message', '[anonymised]')

  if (leadErr) {
    console.error('[data-retention] leads update failed', {
      org_id: orgId,
      error: leadErr.message,
    })
  }

  // ── 2b. Anonymise whatsapp_processed_messages ────────────────────────────
  const { error: waErr } = await db
    .from('whatsapp_processed_messages')
    .update({ phone: '***' })
    .eq('organization_id', orgId)
    .lt('created_at', cutoffIso)
    .neq('phone', '***') // skip already-anonymised rows

  if (waErr) {
    console.error('[data-retention] whatsapp_processed_messages update failed', {
      org_id: orgId,
      error: waErr.message,
    })
  }

  // ── 2c. Anonymise the conversation transcript ────────────────────────────
  // whatsapp_messages holds what parents and staff actually wrote — the most
  // personal data in the schema, and squarely within the retention promise.
  const { error: transcriptErr } = await db
    .from('whatsapp_messages')
    .update({ phone: '***', body: '[anonymised]' })
    .eq('organization_id', orgId)
    .lt('created_at', cutoffIso)
    .neq('phone', '***') // skip already-anonymised rows

  if (transcriptErr) {
    console.error('[data-retention] whatsapp_messages update failed', {
      org_id: orgId,
      error: transcriptErr.message,
    })
  }
}
