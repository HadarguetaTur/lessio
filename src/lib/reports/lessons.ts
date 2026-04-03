/**
 * Lessons report data layer.
 * Counts scheduled vs cancelled lessons by calendar month, server-side only.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'
import { getRollingMonthsStart } from './params'

export type MonthlyLessonBucket = {
  month: string   // 'yyyy-MM'
  label: string
  count: number
  cancelled: number
}

export type LessonsReportData = {
  buckets: MonthlyLessonBucket[]
  totalScheduled: number
  totalCancelled: number
}

export async function getLessonsReport(
  orgId: string,
  timezone: string,
  months = 12
): Promise<LessonsReportData> {
  const db = createServiceRoleClient()
  const now = DateTime.now().setZone(timezone)
  const from = getRollingMonthsStart(timezone, months, now)

  const { data, error } = await db
    .from('lessons')
    .select('start_at, status')
    .eq('organization_id', orgId)
    .gte('start_at', from)

  if (error) throw new Error(`Lessons report query failed: ${error.message}`)

  const bucketMap = new Map<string, { count: number; cancelled: number }>()
  for (let i = months - 1; i >= 0; i--) {
    bucketMap.set(now.minus({ months: i }).startOf('month').toFormat('yyyy-MM'), {
      count: 0,
      cancelled: 0,
    })
  }

  for (const lesson of data ?? []) {
    const key = DateTime.fromISO(lesson.start_at, { zone: 'utc' })
      .setZone(timezone)
      .toFormat('yyyy-MM')
    const bucket = bucketMap.get(key)
    if (bucket) {
      if (lesson.status === 'cancelled') {
        bucket.cancelled++
      } else {
        bucket.count++
      }
    }
  }

  const buckets: MonthlyLessonBucket[] = [...bucketMap.entries()].map(([month, b]) => ({
    month,
    label: DateTime.fromFormat(month, 'yyyy-MM', { zone: timezone })
      .setLocale('he')
      .toFormat('LLLL yyyy'),
    count: b.count,
    cancelled: b.cancelled,
  }))

  return {
    buckets,
    totalScheduled: buckets.reduce((s, b) => s + b.count, 0),
    totalCancelled: buckets.reduce((s, b) => s + b.cancelled, 0),
  }
}
