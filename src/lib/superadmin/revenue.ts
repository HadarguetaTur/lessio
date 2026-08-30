/**
 * Lessio's own invoices and MRR movement.
 * Server-only; service-role client.
 *
 * Per /docs/sprint-34-scope.md § /admin/revenue.
 *
 * `saas_invoices` has existed since the platform billing migration and was only
 * ever read one org at a time, for that org's own /account/billing screen. The
 * platform could not see its own invoices anywhere.
 */

import { DateTime } from 'luxon'

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type SaasInvoiceRow = {
  id: string
  organizationId: string
  organizationName: string
  amount: number
  currency: string
  status: 'paid' | 'pending' | 'failed'
  documentUrl: string | null
  periodStart: string | null
  periodEnd: string | null
  issuedAt: string | null
  createdAt: string
}

export type RevenueTotals = {
  collectedThisMonth: number
  pendingAmount: number
  failedAmount: number
  failedCount: number
  /** Collected per calendar month, oldest first. */
  monthly: { month: string; collected: number }[]
}

type RawInvoice = {
  id: string
  organization_id: string
  amount: number | string
  currency: string
  status: string
  sumit_document_url: string | null
  billing_period_start: string | null
  billing_period_end: string | null
  issued_at: string | null
  created_at: string
  organizations: { name: string } | null
}

export async function listSaasInvoicesForPlatform(
  limit = 300
): Promise<SaasInvoiceRow[]> {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('saas_invoices')
    .select(
      `id, organization_id, amount, currency, status, sumit_document_url,
       billing_period_start, billing_period_end, issued_at, created_at,
       organizations ( name )`
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return (data as unknown as RawInvoice[]).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    organizationName: r.organizations?.name ?? '—',
    amount: Number(r.amount),
    currency: r.currency,
    status: r.status as SaasInvoiceRow['status'],
    documentUrl: r.sumit_document_url,
    periodStart: r.billing_period_start,
    periodEnd: r.billing_period_end,
    issuedAt: r.issued_at,
    createdAt: r.created_at,
  }))
}

/** Twelve months back, so a sparse history still renders a full axis. */
const HISTORY_MONTHS = 12

export function computeRevenueTotals(
  invoices: SaasInvoiceRow[],
  now: DateTime = DateTime.utc()
): RevenueTotals {
  const monthStart = now.startOf('month')

  const paid = invoices.filter((i) => i.status === 'paid')
  const failed = invoices.filter((i) => i.status === 'failed')
  const pending = invoices.filter((i) => i.status === 'pending')

  // An invoice is "collected" on the date it was issued, falling back to when
  // the row appeared. Sorting by created_at alone would put a back-dated
  // document in the wrong month.
  const collectedAt = (i: SaasInvoiceRow) =>
    DateTime.fromISO(i.issuedAt ?? i.createdAt)

  const buckets = new Map<string, number>()
  for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
    buckets.set(monthStart.minus({ months: i }).toFormat('yyyy-MM'), 0)
  }

  for (const inv of paid) {
    const key = collectedAt(inv).toFormat('yyyy-MM')
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + inv.amount)
  }

  return {
    collectedThisMonth: paid
      .filter((i) => collectedAt(i) >= monthStart)
      .reduce((s, i) => s + i.amount, 0),
    pendingAmount: pending.reduce((s, i) => s + i.amount, 0),
    failedAmount: failed.reduce((s, i) => s + i.amount, 0),
    failedCount: failed.length,
    monthly: [...buckets.entries()].map(([month, collected]) => ({ month, collected })),
  }
}
