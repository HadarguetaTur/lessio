/**
 * Applies migration 20260830190000_strip_currency_from_templates against the
 * linked project, scoped to that one change.
 *
 * `supabase db push` would carry two unrelated in-flight migrations to
 * production with it, so the same substitution runs here through the service
 * role instead. It is the identical rewrite the SQL performs — only the exact
 * `₪{{amount}}` / `₪{{total}}` shapes, with or without a space — so a symbol an
 * owner deliberately wrote elsewhere in their copy is left alone.
 *
 * Idempotent: a second run matches nothing.
 *
 *   npx tsx scripts/strip-currency-from-templates.ts          # report only
 *   npx tsx scripts/strip-currency-from-templates.ts --apply  # write
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

/** Same pattern as the SQL: the symbol immediately before {{amount}}/{{total}}. */
const PATTERN = /₪[ \t]?(\{\{(?:amount|total)\}\})/g

type Row = { organization_id: string; type: string; locale: string; body_template: string }

async function main(): Promise<void> {
  loadEnvLocal()
  const apply = process.argv.includes('--apply')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  console.log(`Target: ${url}`)
  console.log(apply ? 'Mode:   APPLY (writes)\n' : 'Mode:   report only (no writes)\n')

  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await db
    .from('message_templates')
    .select('organization_id, type, locale, body_template')

  if (error) {
    console.error('Failed to read message_templates:', error.message)
    process.exit(1)
  }

  const rows = (data ?? []) as Row[]
  const affected = rows.filter((r) => PATTERN.test(r.body_template))
  // .test() with /g advances lastIndex; reset before reuse.
  PATTERN.lastIndex = 0

  console.log(`${rows.length} customised template row(s) in total.`)
  console.log(`${affected.length} carry a literal symbol before {{amount}} / {{total}}.\n`)

  if (affected.length === 0) {
    console.log('Nothing to change.')
    return
  }

  let changed = 0
  for (const row of affected) {
    const next = row.body_template.replace(PATTERN, '$1')
    PATTERN.lastIndex = 0

    console.log(`· org ${row.organization_id}  ${row.type} [${row.locale}]`)
    console.log(`    before: ${JSON.stringify(row.body_template)}`)
    console.log(`    after:  ${JSON.stringify(next)}`)

    if (!apply) continue

    const { error: updErr } = await db
      .from('message_templates')
      .update({ body_template: next, updated_at: new Date().toISOString() })
      .eq('organization_id', row.organization_id)
      .eq('type', row.type)
      .eq('locale', row.locale)

    if (updErr) {
      console.error(`    FAILED: ${updErr.message}`)
      process.exitCode = 1
    } else {
      changed++
    }
  }

  console.log(
    apply ? `\nUpdated ${changed}/${affected.length} row(s).` : '\nRe-run with --apply to write.'
  )
}

main().catch((err) => {
  console.error('Unexpected failure:', err)
  process.exit(1)
})
