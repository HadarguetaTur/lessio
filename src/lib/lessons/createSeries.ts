'use server'

/**
 * createLessonSeries — server-only series creation logic.
 * Per /docs/sprint-11-scope.md § Story 2.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type SeriesFrequency = 'weekly' | 'biweekly'

export type SeriesRule = {
  frequency: SeriesFrequency
  day_of_week: number        // 0=Sun … 6=Sat
  start_time: string         // 'HH:MM' in org timezone
  duration_minutes: number
  until: string              // 'YYYY-MM-DD' inclusive
}

export type CreateSeriesParams = {
  orgId: string
  teacherId: string
  studentId: string
  rule: SeriesRule
  createdByProfileId: string
}

export type CreateSeriesResult = {
  seriesId: string
  created: number
  skipped: number
  conflicts: string[]        // ISO date strings that were skipped
}

/**
 * Creates a lesson_series row plus all individual lesson + lesson_students rows
 * for each non-conflicting candidate date.
 *
 * Uses service role (bypasses RLS).
 * Wrapped in a loop (not a DB transaction) — partial success is acceptable.
 */
export async function createLessonSeries(
  params: CreateSeriesParams
): Promise<CreateSeriesResult> {
  const { orgId, teacherId, studentId, rule, createdByProfileId } = params
  const db = createServiceRoleClient()

  // 1. Fetch org timezone
  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', orgId)
    .single()

  if (orgError || !org) throw new Error(`Organization not found: ${orgId}`)
  const { timezone } = org

  // 2. Insert lesson_series row
  const { data: series, error: seriesError } = await db
    .from('lesson_series')
    .insert({
      organization_id: orgId,
      teacher_id: teacherId,
      student_id: studentId,
      rule,
      created_by: createdByProfileId,
    })
    .select('id')
    .single()

  if (seriesError || !series) {
    throw new Error(`Failed to create lesson series: ${seriesError?.message}`)
  }

  const seriesId = series.id

  // 3. Generate candidate dates
  const until = DateTime.fromISO(rule.until, { zone: timezone }).endOf('day')
  const stepDays = rule.frequency === 'biweekly' ? 14 : 7

  // luxon day_of_week: 1=Mon…7=Sun. Our 0-based: 0=Sun…6=Sat
  // Convert our day_of_week to luxon weekday
  const luxonWeekday = rule.day_of_week === 0 ? 7 : rule.day_of_week

  // Find the first occurrence of the target day_of_week strictly after today
  const today = DateTime.now().setZone(timezone).startOf('day')
  let cursor = today.plus({ days: 1 })
  while (cursor.weekday !== luxonWeekday) {
    cursor = cursor.plus({ days: 1 })
  }

  const candidates: DateTime[] = []
  while (cursor <= until) {
    candidates.push(cursor)
    cursor = cursor.plus({ days: stepDays })
  }

  if (candidates.length === 0) {
    return { seriesId, created: 0, skipped: 0, conflicts: [] }
  }

  // 4. Load org holidays for conflict check (fetch once)
  const firstDate = candidates[0].toISODate()!
  const lastDate = candidates[candidates.length - 1].toISODate()!

  const { data: holidays } = await db
    .from('organization_holidays')
    .select('date')
    .eq('organization_id', orgId)
    .gte('date', firstDate)
    .lte('date', lastDate)

  const holidaySet = new Set((holidays ?? []).map((h) => h.date))

  // 5. Process each candidate
  let created = 0
  let skipped = 0
  const conflicts: string[] = []

  for (const day of candidates) {
    const dateStr = day.toISODate()! // YYYY-MM-DD

    // a. Holiday check
    if (holidaySet.has(dateStr)) {
      skipped++
      conflicts.push(dateStr)
      continue
    }

    // b. Build UTC start/end for this slot
    const slotStart = DateTime.fromISO(`${dateStr}T${rule.start_time}`, {
      zone: timezone,
    }).toUTC()
    const slotEnd = slotStart.plus({ minutes: rule.duration_minutes })

    const startUtc = slotStart.toISO()!
    const endUtc = slotEnd.toISO()!

    // c. Check teacher lesson overlap (status != 'cancelled')
    const { data: teacherConflict } = await db
      .from('lessons')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .lt('start_at', endUtc)
      .gt('end_at', startUtc)
      .limit(1)

    if (teacherConflict && teacherConflict.length > 0) {
      skipped++
      conflicts.push(dateStr)
      continue
    }

    // d. Check student lesson overlap (status != 'cancelled')
    const { data: studentLessonIds } = await db
      .from('lesson_students')
      .select('lesson_id')
      .eq('student_id', studentId)

    if (studentLessonIds && studentLessonIds.length > 0) {
      const lessonIds = studentLessonIds.map((r) => r.lesson_id)
      const { data: studentConflict } = await db
        .from('lessons')
        .select('id')
        .in('id', lessonIds)
        .eq('organization_id', orgId)
        .neq('status', 'cancelled')
        .lt('start_at', endUtc)
        .gt('end_at', startUtc)
        .limit(1)

      if (studentConflict && studentConflict.length > 0) {
        skipped++
        conflicts.push(dateStr)
        continue
      }
    }

    // e. Check active slot_locks
    const { data: lockConflict } = await db
      .from('slot_locks')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .lt('start_at', endUtc)
      .gt('end_at', startUtc)
      .limit(1)

    if (lockConflict && lockConflict.length > 0) {
      skipped++
      conflicts.push(dateStr)
      continue
    }

    // f. Insert lesson
    const { data: lesson, error: lessonError } = await db
      .from('lessons')
      .insert({
        organization_id: orgId,
        teacher_id: teacherId,
        start_at: startUtc,
        end_at: endUtc,
        status: 'scheduled',
        series_id: seriesId,
        lesson_type: 'individual',
      })
      .select('id')
      .single()

    if (lessonError || !lesson) {
      skipped++
      conflicts.push(dateStr)
      continue
    }

    // g. Insert lesson_students
    const { error: lsError } = await db.from('lesson_students').insert({
      lesson_id: lesson.id,
      student_id: studentId,
      organization_id: orgId,
    })

    if (lsError) {
      // Roll back the lesson row and count as skipped
      await db.from('lessons').delete().eq('id', lesson.id)
      skipped++
      conflicts.push(dateStr)
      continue
    }

    created++
  }

  return { seriesId, created, skipped, conflicts }
}
