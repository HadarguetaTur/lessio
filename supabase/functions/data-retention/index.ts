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
 *         user_phone → '***', message → '[anonymised]', response → '[anonymised]'
 *      b. whatsapp_processed_messages.phone → '***' for rows older than retention window
 *   3. Failures are isolated per org
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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

  // ── 2a. Anonymise conversation_log ──────────────���───────────────────────
  const { error: convErr } = await db
    .from('conversation_log')
    .update({
      user_phone: '***',
      message: '[anonymised]',
      response: '[anonymised]',
    })
    .eq('organization_id', orgId)
    .lt('created_at', cutoffIso)
    .neq('user_phone', '***') // skip already-anonymised rows

  if (convErr) {
    console.error('[data-retention] conversation_log update failed', {
      org_id: orgId,
      error: convErr.message,
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
}
