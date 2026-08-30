/**
 * One-time backfill: seed auto Jewish holidays for all existing organizations.
 *
 * Idempotent and safe to re-run — the sync upserts with ignoreDuplicates and
 * respects organization_holiday_dismissals, so nothing is duplicated and
 * deleted holidays are not resurrected.
 *
 * Usage:
 *   npx tsx scripts/backfill-holidays.ts --dry-run   # print would-be rows only
 *   npx tsx scripts/backfill-holidays.ts             # apply
 *
 * Env (falling back to .env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { DateTime } from 'luxon'
import { computeUpcomingHolidays } from '../src/lib/holidays/hebrewHolidays'

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim().replace(/^﻿/, '')
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const db = createClient(url, key)

async function main() {
  const from = DateTime.now().setZone('Asia/Jerusalem').toISODate()!
  console.log(`Backfilling auto holidays from ${from}${DRY_RUN ? ' (dry run)' : ''}\n`)

  const { data: orgs, error } = await db
    .from('organizations')
    .select('id, name, default_locale')
    .order('name')
  if (error) {
    console.error('org list failed:', error.message)
    process.exit(1)
  }

  let totalInserted = 0
  for (const org of orgs ?? []) {
    const locale = org.default_locale === 'en' ? 'en' : 'he'
    const candidates = computeUpcomingHolidays(from, locale)

    const { data: dismissals, error: dErr } = await db
      .from('organization_holiday_dismissals')
      .select('date')
      .eq('organization_id', org.id)
      .gte('date', from)
    if (dErr) {
      console.error(`  ${org.name}: dismissals lookup failed: ${dErr.message}`)
      continue
    }
    const dismissed = new Set((dismissals ?? []).map((d) => d.date))
    const rows = candidates
      .filter((h) => !dismissed.has(h.date))
      .map((h) => ({ organization_id: org.id, date: h.date, name: h.name, source: 'auto' }))

    if (DRY_RUN) {
      console.log(`${org.name} (${locale}): would sync ${rows.length} candidate rows`)
      for (const r of rows) console.log(`    ${r.date}  ${r.name}`)
      continue
    }

    const { data: upserted, error: uErr } = await db
      .from('organization_holidays')
      .upsert(rows, { onConflict: 'organization_id,date', ignoreDuplicates: true })
      .select('id')
    if (uErr) {
      console.error(`  ${org.name}: upsert failed: ${uErr.message}`)
      continue
    }
    const inserted = upserted?.length ?? 0
    totalInserted += inserted
    console.log(`${org.name} (${locale}): inserted ${inserted}`)
  }

  if (!DRY_RUN) console.log(`\nDone. Total inserted: ${totalInserted}`)
}

main()
