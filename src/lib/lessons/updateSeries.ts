'use server'

/**
 * Extend, shorten or delete a recurring lesson series after creation.
 * Complements createSeries.ts (initial generation) and cancelSeries.ts
 * (cancellation of scheduled occurrences).
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { SeriesRule } from '@/lib/lessons/createSeries'
import { cancelLessonSeries } from '@/lib/lessons/cancelSeries'

export type UpdateSeriesResult = {
  /** Lessons newly created (extend) or cancelled (shorten). */
  affected: number
  /** ISO dates skipped on extend (holiday / overlap). */
  conflicts: string[]
}

async function getSeriesOrThrow(db: ReturnType<typeof createServiceRoleClient>, seriesId: string, orgId: string) {
  const { data: series, error } = await db
    .from('lesson_series')
    .select('id, teacher_id, rule')
    .eq('id', seriesId)
    .eq('organization_id', orgId)
    .single()
  if (error || !series) throw new Error(`Series not found: ${error?.message}`)
  return { ...series, rule: series.rule as SeriesRule }
}

async function setSeriesUntil(
  db: ReturnType<typeof createServiceRoleClient>,
  seriesId: string,
  rule: SeriesRule,
  until: string
) {
  const { error } = await db
    .from('lesson_series')
    .update({ rule: { ...rule, until } })
    .eq('id', seriesId)
  if (error) throw new Error(`Failed to update series rule: ${error.message}`)
}

/**
 * Generates the missing weekly/biweekly occurrences between the series' last
 * lesson and `newUntil`. Participants, type and price are copied from the most
 * recent non-cancelled lesson of the series, so pair/group series extend with
 * everyone on board.
 */
export async function extendLessonSeries(
  seriesId: string,
  orgId: string,
  newUntil: string
): Promise<UpdateSeriesResult> {
  const db = createServiceRoleClient()
  const series = await getSeriesOrThrow(db, seriesId, orgId)

  const { data: org } = await db.from('organizations').select('timezone').eq('id', orgId).single()
  const timezone = org?.timezone ?? 'Asia/Jerusalem'

  // Template lesson: the latest non-cancelled occurrence.
  const { data: template, error: tErr } = await db
    .from('lessons')
    .select('start_at, lesson_type, max_students, price_per_student, lesson_students(student_id)')
    .eq('series_id', seriesId)
    .eq('organization_id', orgId)
    .neq('status', 'cancelled')
    .order('start_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (tErr) throw new Error(tErr.message)
  if (!template) throw new Error('Series has no lessons to extend from')

  const studentIds = (template.lesson_students as { student_id: string }[]).map((s) => s.student_id)
  const rule = series.rule
  const stepDays = rule.frequency === 'biweekly' ? 14 : 7

  const until = DateTime.fromISO(newUntil, { zone: timezone }).endOf('day')
  const today = DateTime.now().setZone(timezone).startOf('day')
  const lastLessonDay = DateTime.fromISO(template.start_at, { zone: timezone }).startOf('day')
  const floor = lastLessonDay > today ? lastLessonDay : today

  const luxonWeekday = rule.day_of_week === 0 ? 7 : rule.day_of_week
  let cursor = floor.plus({ days: 1 })
  while (cursor.weekday !== luxonWeekday) cursor = cursor.plus({ days: 1 })

  const { data: holidays } = await db
    .from('organization_holidays')
    .select('date')
    .eq('organization_id', orgId)
    .gte('date', cursor.toISODate()!)
    .lte('date', until.toISODate()!)
  const holidaySet = new Set((holidays ?? []).map((h) => h.date))

  let created = 0
  const conflicts: string[] = []
  for (; cursor <= until; cursor = cursor.plus({ days: stepDays })) {
    const dateStr = cursor.toISODate()!
    if (holidaySet.has(dateStr)) {
      conflicts.push(dateStr)
      continue
    }
    const start = DateTime.fromISO(`${dateStr}T${rule.start_time}`, { zone: timezone }).toUTC()
    const end = start.plus({ minutes: rule.duration_minutes })
    // The no_teacher_lesson_overlap EXCLUDE constraint rejects clashes for us.
    const { data: lesson, error: lErr } = await db
      .from('lessons')
      .insert({
        organization_id: orgId,
        teacher_id: series.teacher_id,
        series_id: seriesId,
        start_at: start.toISO()!,
        end_at: end.toISO()!,
        status: 'scheduled',
        lesson_type: template.lesson_type,
        max_students: template.max_students,
        price_per_student: template.price_per_student,
      })
      .select('id')
      .single()
    if (lErr || !lesson) {
      conflicts.push(dateStr)
      continue
    }
    const { error: jErr } = await db.from('lesson_students').insert(
      studentIds.map((student_id) => ({ lesson_id: lesson.id, student_id, organization_id: orgId }))
    )
    if (jErr) {
      await db.from('lessons').delete().eq('id', lesson.id)
      conflicts.push(dateStr)
      continue
    }
    created++
  }

  await setSeriesUntil(db, seriesId, rule, newUntil)
  return { affected: created, conflicts }
}

/**
 * Moves the series end earlier: cancels every scheduled lesson after `newUntil`
 * (inclusive of nothing — lessons ON `newUntil` itself survive) and stores the
 * new end date on the rule.
 */
export async function shortenLessonSeries(
  seriesId: string,
  orgId: string,
  newUntil: string
): Promise<UpdateSeriesResult> {
  const db = createServiceRoleClient()
  const series = await getSeriesOrThrow(db, seriesId, orgId)

  const dayAfter = DateTime.fromISO(newUntil).plus({ days: 1 }).toISODate()!
  const { cancelled } = await cancelLessonSeries(seriesId, orgId, 'from_date', dayAfter)
  await setSeriesUntil(db, seriesId, series.rule, newUntil)
  return { affected: cancelled, conflicts: [] }
}

/**
 * Deletes the series: cancels all its scheduled lessons, then removes the
 * lesson_series row. Past lessons keep their history — lessons.series_id is
 * ON DELETE SET NULL.
 */
export async function deleteLessonSeries(
  seriesId: string,
  orgId: string
): Promise<UpdateSeriesResult> {
  const db = createServiceRoleClient()
  await getSeriesOrThrow(db, seriesId, orgId) // org-scoping guard

  const { cancelled } = await cancelLessonSeries(seriesId, orgId, 'all')
  const { error } = await db
    .from('lesson_series')
    .delete()
    .eq('id', seriesId)
    .eq('organization_id', orgId)
  if (error) throw new Error(`Failed to delete series: ${error.message}`)
  return { affected: cancelled, conflicts: [] }
}
