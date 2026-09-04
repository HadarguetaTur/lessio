/**
 * READ-ONLY production check for the invoice gap found in UX audit 8.
 *
 * Answers three questions and writes nothing:
 *   1. does the `invoices` storage bucket now exist?
 *   2. how many approved billing records have no invoice_number?
 *   3. how are they spread across orgs and months?
 *
 * Deliberately targets production, so it refuses to run against anything else
 * and refuses to perform any mutation. Run with:
 *   npx tsx scripts/check-invoice-backfill.ts
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'iesxiouhgdxmymveikxh'

function envFromLocalFile(key: string): string {
  const raw = readFileSync('.env.local', 'utf8')
  // Last occurrence wins, matching dotenv.
  const matches = [...raw.matchAll(new RegExp(`^${key}=(.*)$`, 'gm'))]
  const value = matches.at(-1)?.[1]?.trim()
  if (!value) throw new Error(`${key} not found in .env.local`)
  return value
}

const url = envFromLocalFile('NEXT_PUBLIC_SUPABASE_URL')
const serviceKey = envFromLocalFile('SUPABASE_SERVICE_ROLE_KEY')

if (!url.includes(PROD_REF)) {
  console.error(`Refusing to run: expected the production project (${PROD_REF}), got ${url}`)
  process.exit(1)
}

async function main() {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  console.log(`Reading (read-only) from ${url}\n`)

  // 1 ── the bucket
  const { data: buckets, error: bucketErr } = await db.storage.listBuckets()
  if (bucketErr) throw bucketErr
  const names = buckets.map((b) => b.id).sort()
  console.log('storage buckets:', names.join(', '))
  console.log(`invoices bucket present: ${names.includes('invoices') ? 'YES' : 'NO'}\n`)

  // 2 ── approved records with no invoice
  const { count: missing, error: missErr } = await db
    .from('student_monthly_billing')
    .select('id', { count: 'exact', head: true })
    .eq('is_approved', true)
    .is('invoice_number', null)
  if (missErr) throw missErr

  const { count: withInvoice, error: haveErr } = await db
    .from('student_monthly_billing')
    .select('id', { count: 'exact', head: true })
    .eq('is_approved', true)
    .not('invoice_number', 'is', null)
  if (haveErr) throw haveErr

  console.log(`approved bills WITHOUT an invoice: ${missing}`)
  console.log(`approved bills WITH an invoice:    ${withInvoice}\n`)

  // 3 ── spread, so the backfill decision has numbers behind it
  const { data: rows, error: rowsErr } = await db
    .from('student_monthly_billing')
    .select('organization_id, billing_month, total_amount, is_paid, organizations(name)')
    .eq('is_approved', true)
    .is('invoice_number', null)
    .order('billing_month', { ascending: true })
  if (rowsErr) throw rowsErr

  const byOrg = new Map<string, { name: string; count: number; total: number; paid: number; months: Set<string> }>()
  for (const r of rows ?? []) {
    const orgName =
      (r as unknown as { organizations?: { name?: string } }).organizations?.name ?? r.organization_id
    const entry = byOrg.get(r.organization_id) ?? {
      name: orgName,
      count: 0,
      total: 0,
      paid: 0,
      months: new Set<string>(),
    }
    entry.count += 1
    entry.total += Number(r.total_amount ?? 0)
    if (r.is_paid) entry.paid += 1
    entry.months.add(r.billing_month as string)
    byOrg.set(r.organization_id, entry)
  }

  if (byOrg.size === 0) {
    console.log('Nothing to back-fill.')
  } else {
    console.log('per organization:')
    for (const [orgId, e] of byOrg) {
      console.log(
        `  ${e.name} (${orgId.slice(0, 8)}…): ${e.count} bills · ₪${e.total.toFixed(2)} · ` +
          `${e.paid} already paid · months: ${[...e.months].sort().join(', ')}`
      )
    }
  }

  // 4 ── invoice counters, since a back-fill would consume numbers from these
  const { data: counters } = await db
    .from('invoice_counters')
    .select('organization_id, year, document_type, last_number')
    .order('year', { ascending: true })
  console.log('\ninvoice_counters:', counters?.length ? counters : '(none)')

}


// ── follow-up: is a receipt provider already issuing real tax documents? ─────
async function receipts() {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: orgs } = await db
    .from('organizations')
    .select('id, name, receipt_provider, receipt_config_encrypted, receipt_document_type, payment_provider')
  console.log('\n--- receipt/payment provider per org ---')
  for (const o of orgs ?? []) {
    console.log(
      `  ${o.name}: receipt_provider=${o.receipt_provider ?? 'none'} ` +
        `configured=${o.receipt_config_encrypted ? 'YES' : 'no'} ` +
        `doc_type=${o.receipt_document_type ?? 'default'} ` +
        `payment=${o.payment_provider ?? 'none'}`
    )
  }
  const { count: withReceipt } = await db
    .from('charges')
    .select('id', { count: 'exact', head: true })
    .not('receipt_url', 'is', null)
  const { count: paidCharges } = await db
    .from('charges')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'paid')
  console.log(`\ncharges paid: ${paidCharges} · of them with a receipt_url: ${withReceipt}`)
}
main()
  .then(receipts)
  .catch((e) => { console.error(e); process.exit(1) })
