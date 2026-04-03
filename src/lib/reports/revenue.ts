/**
 * Revenue report data layer.
 * Aggregates paid charges by calendar month, server-side only.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import { getRollingMonthsStart } from './params'

export type MonthlyRevenueBucket = {
  month: string   // 'yyyy-MM'
  label: string   // e.g. 'ינואר 2026'
  revenue: number
}

export type RevenueReportData = {
  buckets: MonthlyRevenueBucket[]
  total: number
}

export async function getRevenueReport(
  orgId: string,
  timezone: string,
  months = 12
): Promise<RevenueReportData> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)
  const from = getRollingMonthsStart(timezone, months, now)

  const { data, error } = await db
    .from('charges')
    .select('amount, paid_at')
    .eq('organization_id', orgId)
    .eq('status', 'paid')
    .gte('paid_at', from)

  if (error) throw new Error(`Revenue report query failed: ${error.message}`)

  // Pre-populate all months with zero so gaps render correctly
  const bucketMap = new Map<string, number>()
  for (let i = months - 1; i >= 0; i--) {
    bucketMap.set(now.minus({ months: i }).startOf('month').toFormat('yyyy-MM'), 0)
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

  const buckets: MonthlyRevenueBucket[] = [...bucketMap.entries()].map(([month, revenue]) => ({
    month,
    label: DateTime.fromFormat(month, 'yyyy-MM', { zone: timezone })
      .setLocale('he')
      .toFormat('LLLL yyyy'),
    revenue,
  }))

  return { buckets, total: buckets.reduce((s, b) => s + b.revenue, 0) }
}
