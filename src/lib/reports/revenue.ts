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
}

export type RevenueReportData = {
  buckets: MonthlyRevenueBucket[]
  total: number
  billingTotal: number
  billingPaid: number
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

  const { data, error } = await db
    .from('charges')
    .select('amount, paid_at')
    .eq('organization_id', orgId)
    .eq('status', 'paid')
    .gte('paid_at', from)

  if (error) throw new Error(`Revenue trend query failed: ${error.message}`)

  // Pre-populate all months with zero
  const bucketMap = new Map<string, number>()
  for (let i = months - 1; i >= 0; i--) {
    const key = now.minus({ months: i }).startOf('month').toFormat('yyyy-MM')
    bucketMap.set(key, 0)
  }

  for (const charge of data ?? []) {
    if (!charge.paid_at) continue
    const key = DateTime.fromISO(charge.paid_at, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('yyyy-MM')
    if (bucketMap.has(key)) {
      bucketMap.set(key, (bucketMap.get(key) ?? 0) + Number(charge.amount))
    }
  }

  return [...bucketMap.entries()].map(([month, amount]) => ({ month, amount }))
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

  const [chargesRes, billingRes] = await Promise.all([
    db
      .from('charges')
      .select('amount, paid_at')
      .eq('organization_id', orgId)
      .eq('status', 'paid')
      .gte('paid_at', from),
    db
      .from('student_monthly_billing')
      .select('billing_month, total_amount, is_paid')
      .eq('organization_id', orgId)
      .gte('billing_month', fromBillingMonth),
  ])

  const data = chargesRes.data
  if (chargesRes.error) throw new Error(`Revenue report query failed: ${chargesRes.error.message}`)
  if (billingRes.error) {
    throw new Error(`Revenue report billing query failed: ${billingRes.error.message}`)
  }

  // Pre-populate all months with zero so gaps render correctly
  const bucketMap = new Map<string, number>()
  const billingTotalMap = new Map<string, number>()
  const billingPaidMap = new Map<string, number>()
  for (let i = months - 1; i >= 0; i--) {
    const key = now.minus({ months: i }).startOf('month').toFormat('yyyy-MM')
    bucketMap.set(key, 0)
    billingTotalMap.set(key, 0)
    billingPaidMap.set(key, 0)
  }

  for (const charge of data ?? []) {
    if (!charge.paid_at) continue
    const key = DateTime.fromISO(charge.paid_at, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('yyyy-MM')
    if (bucketMap.has(key)) {
      bucketMap.set(key, (bucketMap.get(key) ?? 0) + Number(charge.amount))
    }
  }

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
  }))

  return {
    buckets,
    total: buckets.reduce((s, b) => s + b.revenue, 0),
    billingTotal: buckets.reduce((s, b) => s + b.billingTotal, 0),
    billingPaid: buckets.reduce((s, b) => s + b.billingPaid, 0),
  }
}
