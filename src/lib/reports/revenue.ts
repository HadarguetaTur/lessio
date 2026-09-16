/**
 * Revenue report data layer.
 * Aggregates paid charges by calendar month, server-side only.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import type { AppLocale } from '@/lib/i18n/locale'
import { toLuxonLocale } from '@/lib/i18n/locale'
import { getRollingMonthsStart } from './params'

export type MonthlyRevenueBucket = {
  month: string   // 'yyyy-MM'
  label: string   // e.g. 'ינואר 2026'
  revenue: number
  billingTotal: number   // monthly billing total for this month
  billingPaid: number    // monthly billing paid for this month
  /** Money received for punch-card sales, net of their refunds — part of `revenue` (decision #46). */
  packSales: number
}

export type RevenueReportData = {
  buckets: MonthlyRevenueBucket[]
  total: number
  billingTotal: number
  billingPaid: number
  packSales: number
}

/**
 * Returns simplified monthly revenue data for sparkline charts.
 * Each entry has a month label and total paid amount.
 */
export async function getMonthlyRevenueTrend(
  orgId: string,
  timezone: string,
  months = 12
): Promise<{ month: string; amount: number }[]> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)
  const from = getRollingMonthsStart(timezone, months, now)

  // Revenue is money received, so it is bucketed by payment date from
  // charge_payments rather than by the charge's closing date. With partial
  // payments those differ: 200 in July and 250 in August on one charge belong
  // to two different months.
  const [{ data, error }, refundsRes] = await Promise.all([
    db
      .from('charge_payments')
      .select('amount, paid_at')
      .eq('organization_id', orgId)
      .gte('paid_at', from),
    // Net of refunds recorded in the same bucket — charge_payments only grows,
    // so money that went back would otherwise stay on the chart forever.
    db
      .from('charges')
      .select('refunded_amount, refunded_at')
      .eq('organization_id', orgId)
      .not('refunded_at', 'is', null)
      .gte('refunded_at', from),
  ])

  if (error) throw new Error(`Revenue trend query failed: ${error.message}`)
  if (refundsRes.error) throw new Error(`Revenue trend refund query failed: ${refundsRes.error.message}`)

  // Pre-populate all months with zero
  const bucketMap = new Map<string, number>()
  for (let i = months - 1; i >= 0; i--) {
    const key = now.minus({ months: i }).startOf('month').toFormat('yyyy-MM')
    bucketMap.set(key, 0)
  }

  for (const payment of data ?? []) {
    if (!payment.paid_at) continue
    const key = DateTime.fromISO(payment.paid_at, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('yyyy-MM')
    if (bucketMap.has(key)) {
      bucketMap.set(key, (bucketMap.get(key) ?? 0) + Number(payment.amount))
    }
  }

  subtractRefunds(bucketMap, refundsRes.data, timezone)

  return [...bucketMap.entries()].map(([month, amount]) => ({ month, amount }))
}

/**
 * Nets refunds out of month buckets, in place.
 *
 * A refund lands in the month it was RECORDED, not the month the original
 * payment arrived — the same rule that puts a payment in the month it arrived.
 * Reports for closed months therefore stay stable instead of silently changing
 * when someone records a refund for an old charge. Buckets are floored at zero
 * so a heavy refund month never renders as a negative bar.
 */
function subtractRefunds(
  bucketMap: Map<string, number>,
  refunds: Array<{ refunded_amount: number | string | null; refunded_at: string | null }> | null,
  timezone: string
): void {
  for (const refund of refunds ?? []) {
    if (!refund.refunded_at) continue
    const key = DateTime.fromISO(refund.refunded_at, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('yyyy-MM')
    if (!bucketMap.has(key)) continue
    const next = (bucketMap.get(key) ?? 0) - Number(refund.refunded_amount ?? 0)
    bucketMap.set(key, Math.max(0, Math.round(next * 100) / 100))
  }
}

export async function getRevenueReport(
  orgId: string,
  timezone: string,
  months = 12,
  locale: AppLocale = 'he'
): Promise<RevenueReportData> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)
  const from = getRollingMonthsStart(timezone, months, now)
  const fromBillingMonth = now
    .minus({ months: months - 1 })
    .startOf('month')
    .toFormat('yyyy-MM')

  const [chargesRes, billingRes, refundsRes] = await Promise.all([
    // Bucketed by when the money arrived — see getMonthlyRevenueTrend.
    db
      .from('charge_payments')
      .select('amount, paid_at, charges(charge_type)')
      .eq('organization_id', orgId)
      .gte('paid_at', from),
    db
      .from('student_monthly_billing')
      .select('billing_month, total_amount, is_paid')
      .eq('organization_id', orgId)
      .gte('billing_month', fromBillingMonth),
    // Netted out below — see subtractRefunds.
    db
      .from('charges')
      .select('refunded_amount, refunded_at, charge_type')
      .eq('organization_id', orgId)
      .not('refunded_at', 'is', null)
      .gte('refunded_at', from),
  ])

  const data = chargesRes.data
  if (chargesRes.error) throw new Error(`Revenue report query failed: ${chargesRes.error.message}`)
  if (billingRes.error) {
    throw new Error(`Revenue report billing query failed: ${billingRes.error.message}`)
  }
  if (refundsRes.error) {
    throw new Error(`Revenue report refund query failed: ${refundsRes.error.message}`)
  }

  // Pre-populate all months with zero so gaps render correctly
  const bucketMap = new Map<string, number>()
  const billingTotalMap = new Map<string, number>()
  const billingPaidMap = new Map<string, number>()
  const packSalesMap = new Map<string, number>()
  for (let i = months - 1; i >= 0; i--) {
    const key = now.minus({ months: i }).startOf('month').toFormat('yyyy-MM')
    bucketMap.set(key, 0)
    billingTotalMap.set(key, 0)
    billingPaidMap.set(key, 0)
    packSalesMap.set(key, 0)
  }

  for (const payment of data ?? []) {
    if (!payment.paid_at) continue
    const key = DateTime.fromISO(payment.paid_at, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('yyyy-MM')
    if (bucketMap.has(key)) {
      bucketMap.set(key, (bucketMap.get(key) ?? 0) + Number(payment.amount))
      // A pack sale is its own category (decision #46); a lesson a punch paid
      // for brings in nothing here, because no money moved for it.
      const charge = (payment as { charges?: { charge_type?: string } | { charge_type?: string }[] | null }).charges
      const chargeType = Array.isArray(charge) ? charge[0]?.charge_type : charge?.charge_type
      if (chargeType === 'pack') packSalesMap.set(key, (packSalesMap.get(key) ?? 0) + Number(payment.amount))
    }
  }

  subtractRefunds(bucketMap, refundsRes.data, timezone)
  subtractRefunds(
    packSalesMap,
    (refundsRes.data ?? []).filter((r) => (r as { charge_type?: string }).charge_type === 'pack'),
    timezone
  )

  for (const b of billingRes.data ?? []) {
    const key = b.billing_month as string
    if (billingTotalMap.has(key)) {
      billingTotalMap.set(key, (billingTotalMap.get(key) ?? 0) + Number(b.total_amount))
      if (b.is_paid) {
        billingPaidMap.set(key, (billingPaidMap.get(key) ?? 0) + Number(b.total_amount))
      }
    }
  }

  const luxonLoc = toLuxonLocale(locale)
  const buckets: MonthlyRevenueBucket[] = [...bucketMap.entries()].map(([month, revenue]) => ({
    month,
    label: DateTime.fromFormat(month, 'yyyy-MM', { zone: timezone })
      .setLocale(luxonLoc)
      .toFormat('LLLL yyyy'),
    revenue,
    billingTotal: billingTotalMap.get(month) ?? 0,
    billingPaid: billingPaidMap.get(month) ?? 0,
    packSales: packSalesMap.get(month) ?? 0,
  }))

  return {
    buckets,
    total: buckets.reduce((s, b) => s + b.revenue, 0),
    billingTotal: buckets.reduce((s, b) => s + b.billingTotal, 0),
    billingPaid: buckets.reduce((s, b) => s + b.billingPaid, 0),
    packSales: buckets.reduce((s, b) => s + b.packSales, 0),
  }
}
