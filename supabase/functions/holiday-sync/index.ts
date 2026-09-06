/**
 * holiday-sync — Supabase Edge Function
 *
 * Trigger: scheduled cron, monthly on the 1st at 02:00 UTC (scripts/setup-crons.sql).
 *
 * Keeps every organization's auto-populated Jewish holidays topped up ~18
 * months ahead. Idempotent: upsert with ignoreDuplicates, and dates the org
 * dismissed (deleted an auto holiday) are never re-inserted.
 *
 * Mirrors src/lib/holidays/syncOrgHolidays.ts (Node) via
 * _shared/hebrewHolidays.ts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCronRequest, getSupabaseSecretKey } from '../_shared/supabaseSecret.ts'
import { computeUpcomingHolidays } from '../_shared/hebrewHolidays.ts'
import { reportEdgeError, serveWithErrorReporting } from '../_shared/telemetry.ts'

function todayInJerusalem(): string {
  // en-CA locale formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())
}

serveWithErrorReporting('holiday-sync', async (_req) => {
  const authError = authorizeCronRequest(_req)
  if (authError) return authError

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = getSupabaseSecretKey()
  const db = createClient(supabaseUrl, serviceRoleKey)

  const from = todayInJerusalem()

  const { data: orgs, error: orgsError } = await db
    .from('organizations')
    .select('id, default_locale')
  if (orgsError) {
    console.error('[holiday-sync] org list failed', { error: orgsError.message })
    return new Response(JSON.stringify({ error: orgsError.message }), { status: 500 })
  }

  let synced = 0
  let failed = 0

  for (const org of orgs ?? []) {
    try {
      const locale = org.default_locale === 'en' ? 'en' : 'he'
      const candidates = computeUpcomingHolidays(from, locale)

      const { data: dismissals, error: dismissalsError } = await db
        .from('organization_holiday_dismissals')
        .select('date')
        .eq('organization_id', org.id)
        .gte('date', from)
      if (dismissalsError) throw new Error(dismissalsError.message)

      const dismissed = new Set((dismissals ?? []).map((d: { date: string }) => d.date))
      const rows = candidates
        .filter((h) => !dismissed.has(h.date))
        .map((h) => ({ organization_id: org.id, date: h.date, name: h.name, source: 'auto' }))

      if (rows.length > 0) {
        const { error: upsertError } = await db
          .from('organization_holidays')
          .upsert(rows, { onConflict: 'organization_id,date', ignoreDuplicates: true })
        if (upsertError) throw new Error(upsertError.message)
      }
      synced++
    } catch (e) {
      failed++
      console.error('[holiday-sync] org sync failed', {
        orgId: org.id,
        error: e instanceof Error ? e.message : String(e),
      })
      await reportEdgeError(db, {
        thrown: e,
        route: 'holiday-sync',
        organizationId: org.id,
      })
    }
  }

  console.info('[holiday-sync] done', { synced, failed })
  return new Response(JSON.stringify({ synced, failed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
