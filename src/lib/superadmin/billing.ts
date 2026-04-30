/**
 * Billing readiness data per organization.
 * Server-only — uses service role client.
 *
 * Per /docs/sprint-18-scope.md § Story 7.
 * NOTE: This page does NOT implement plans, invoices, subscriptions, or Stripe.
 * It is a billing-readiness queue for future Sprint 21 subscription migration.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type OrgBillingRow = {
  id: string
  name: string
  paymentConnected: boolean
  receiptConnected: boolean
  firstPaidChargeDate: string | null
  totalPaidRevenue: number
  lastPaidChargeDate: string | null
}

export async function getBillingReadiness(): Promise<OrgBillingRow[]> {
  const db = createServiceRoleClient()

  const [orgsRes, chargesRes] = await Promise.all([
    db
      .from('organizations')
      .select('id, name, payment_provider, receipt_config_encrypted')
      .order('name'),
    db
      .from('charges')
      .select('organization_id, amount, paid_at')
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: true }),
  ])

  const orgs = orgsRes.data ?? []
  const charges = chargesRes.data ?? []

  // Aggregate charge data per org
  type ChargeAgg = { first: string; last: string; total: number }
  const agg = new Map<string, ChargeAgg>()
  for (const c of charges) {
    const existing = agg.get(c.organization_id)
    if (!existing) {
      agg.set(c.organization_id, { first: c.paid_at!, last: c.paid_at!, total: Number(c.amount) })
    } else {
      // charges are ordered asc so last will be updated
      existing.last = c.paid_at!
      existing.total += Number(c.amount)
    }
  }

  return orgs.map((o) => {
    const data = agg.get(o.id)
    return {
      id: o.id,
      name: o.name,
      paymentConnected: !!o.payment_provider,
      receiptConnected: !!o.receipt_config_encrypted,
      firstPaidChargeDate: data?.first ?? null,
      totalPaidRevenue: data?.total ?? 0,
      lastPaidChargeDate: data?.last ?? null,
    }
  })
}
