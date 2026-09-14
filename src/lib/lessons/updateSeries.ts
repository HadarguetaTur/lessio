/**
 * Extend, shorten or delete a recurring lesson series after creation.
 * Complements createSeries.ts (initial generation) and cancelSeries.ts
 * (stopping a series from a date).
 *
 * Not a Server Action module — see the note in createSeries.ts. Every function
 * here takes `orgId` from the caller, so the org must already have been
 * resolved from the session by the calling action.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { MAX_SERIES_OCCURRENCES } from '@/lib/lessons/createSeries'
import { normalizeSeriesRule, type SeriesRule } from '@/lib/lessons/seriesRule'
import { stopLessonSeries } from '@/lib/lessons/cancelSeries'
import { EMPTY_FOOTPRINT, loadSeriesFootprint, SeriesHasHistoryError } from '@/lib/lessons/seriesFootprint'
import { assertSlotBookable, SlotNotBookableError } from '@/lib/booking/assertSlotBookable'

export type UpdateSeriesResult = {
  /** Lessons newly created (extend) or removed (shorten). */
  affected: number
  /** ISO dates skipped on extend (holiday / overlap). */
  conflicts: string[]
  /** Occurrences a shorten left in place because they already happened or were charged. */
  kept?: number
}

async function getSeriesOrThrow(db: ReturnType<typeof createServiceRoleClient>, seriesId: string, orgId: string) {
  const { data: series, error } = await db
    .from('lesson_series')
    .select('id, teacher_id, rule')
    .eq('id', seriesId)
    .eq('organization_id', orgId)
    .single()
  if (error || !series) throw new Error(`Series not found: ${error?.message}`)

  // Casting the jsonb blindly was not merely wrong on a legacy camelCase row —
  // `rule.day_of_week` came back undefined, so the "advance to the target
  // weekday" loop below compared against NaN and never terminated. Refusing the
  // mutation with a named error is the safe failure.
  const rule = normalizeSeriesRule(series.rule)
  if (!rule) throw new Error(`Series ${seriesId} has an unreadable rule and cannot be modified`)

  return { ...series, rule }
}

/**
 * Whether any student on the roster already has a non-cancelled lesson
 * overlapping [startUtc, endUtc). Mirrors the create path's check, including
 * its org scoping — the junction read is by student id, so the org filter on
 * `lessons` is what keeps the answer inside this tenant.
 */
async function anyStudentBusy(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  studentIds: string[],
  startUtc: string,
  endUtc: string
): Promise<boolean> {
  for (const studentId of studentIds) {
    const { data: junction } = await db
      .from('lesson_students')
      .select('lesson_id')
      .eq('student_id', studentId)
    if (!junction?.length) continue

    const { data: clash } = await db
      .from('lessons')
      .select('id')
      .in('id', junction.map((r) => r.lesson_id))
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .lt('start_at', endUtc)
      .gt('end_at', startUtc)
      .limit(1)
    if (clash?.length) return true
  }
  return false
}

async function setSeriesUntil(
  db: ReturnType<typeof createServiceRoleClient>,
  seriesId: string,
  rule: SeriesRule,
  until: string
) {
  // Moving the end date forward revives a stopped series, so the marker goes.
  const { error } = await db
    .from('lesson_series')
    .update({ rule: { ...rule, until }, stopped_at: null })
    .eq('id', seriesId)
  if (error) throw new Error(`Failed to update series rule: ${error.message}`)
}

/**
 * Generates the missing weekly/biweekly occurrences between the series' last
 * lesson and `newUntil`. Participants, type and price are copied from the most
 * recent non-cancelled lesson of the series, so pair/group series extend with
 * everyone on board.
 *
 * SCHED-04: this ran only a holiday check. The create path checks the student's
 * other lessons and any slot lock a parent is holding, and an extension writes
 * exactly the same rows — so extending a series was the one way to book a
 * student into two places at once, or to land on top of a slot a parent was
 * five minutes from confirming. Teacher overlap was already covered, but only
 * by the no_teacher_lesson_overlap EXCLUDE rejecting the insert; that stays the
 * backstop and is deliberately not replaced by a query.
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
    .select('start_at, lesson_type, max_students, price_per_student, group_id, lesson_students(student_id)')
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
  let generated = 0
  const conflicts: string[] = []
  for (; cursor <= until && generated < MAX_SERIES_OCCURRENCES; cursor = cursor.plus({ days: stepDays })) {
    generated++
    const dateStr = cursor.toISODate()!
    if (holidaySet.has(dateStr)) {
      conflicts.push(dateStr)
      continue
    }
    const start = DateTime.fromISO(`${dateStr}T${rule.start_time}`, { zone: timezone }).toUTC()
    const end = start.plus({ minutes: rule.duration_minutes })
    const startUtc = start.toISO()!
    const endUtc = end.toISO()!

    // The SAME write-time authority the parent booking path uses. Extend used
    // to check only `organization_holidays`, student overlap and slot locks —
    // it never read `availability_overrides` and never asked Google, so
    // pushing a series' `until` forward minted up to MAX_SERIES_OCCURRENCES
    // lessons straight through an approved teacher vacation, at whatever
    // duration the stored rule happened to hold. The widest scheduling hole in
    // the product, and reachable from one form field.
    //
    // A failed occurrence is a CONFLICT, not a thrown error: extend already
    // reports the dates it could not fill, and one blocked week must not
    // abandon the other twenty-nine.
    try {
      await assertSlotBookable({
        orgId,
        teacherId: series.teacher_id,
        startUtc,
        endUtc,
        audience: 'admin',
        // Staff diary, not a parent booking — see the note on the option.
        skipMinNotice: true,
      })
    } catch (err) {
      if (err instanceof SlotNotBookableError) {
        conflicts.push(dateStr)
        continue
      }
      throw err
    }

    // Every student on the roster must be free — the same check the create
    // path runs. Without it an extension was the one way to put a student in
    // two places at once.
    if (await anyStudentBusy(db, orgId, studentIds, startUtc, endUtc)) {
      conflicts.push(dateStr)
      continue
    }

    // And a slot a parent is actively holding is not free either, even though
    // no lesson row exists for it yet.
    const { data: lockConflict } = await db
      .from('slot_locks')
      .select('id')
      .eq('teacher_id', series.teacher_id)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .lt('start_at', endUtc)
      .gt('end_at', startUtc)
      .limit(1)
    if (lockConflict?.length) {
      conflicts.push(dateStr)
      continue
    }

    // The no_teacher_lesson_overlap EXCLUDE constraint rejects clashes for us.
    const { data: lesson, error: lErr } = await db
      .from('lessons')
      .insert({
        organization_id: orgId,
        teacher_id: series.teacher_id,
        series_id: seriesId,
        start_at: startUtc,
        end_at: endUtc,
        status: 'scheduled',
        lesson_type: template.lesson_type,
        max_students: template.max_students,
        price_per_student: template.price_per_student,
        // A group series keeps naming its group on the lessons it grows.
        group_id: template.group_id ?? null,
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
 * Moves the series end earlier: removes every planned lesson after `newUntil`
 * (inclusive of nothing — lessons ON `newUntil` itself survive) and stores the
 * new end date on the rule. Occurrences with a footprint are kept.
 */
export async function shortenLessonSeries(
  seriesId: string,
  orgId: string,
  newUntil: string
): Promise<UpdateSeriesResult> {
  const dayAfter = DateTime.fromISO(newUntil).plus({ days: 1 }).toISODate()!
  const { removed, kept } = await stopLessonSeries(seriesId, orgId, dayAfter)
  return { affected: removed, conflicts: [], kept }
}

/**
 * Removes the series outright: every lesson it produced, then the series row.
 *
 * Refuses when any occurrence carries a footprint — completed, cancelled by
 * hand, charged or written about. Those are history, and history is not deleted
 * to make a cleanup convenient (docs/decisions.md #33); the caller is expected
 * to offer "stop the series" instead.
 */
export async function deleteLessonSeries(
  seriesId: string,
  orgId: string
): Promise<{ deleted: number }> {
  const db = createServiceRoleClient()
  await getSeriesOrThrow(db, seriesId, orgId) // org-scoping guard

  const footprint = (await loadSeriesFootprint(db, orgId, [seriesId])).get(seriesId) ?? EMPTY_FOOTPRINT
  if (footprint.blocking.length > 0) throw new SeriesHasHistoryError(footprint.blocking.length)

  // lesson_students cascades; nothing else points at these rows, which is
  // exactly what the footprint check just established.
  const { error: lessonsError } = await db
    .from('lessons')
    .delete()
    .eq('organization_id', orgId)
    .eq('series_id', seriesId)
  if (lessonsError) throw new Error(`Failed to delete series lessons: ${lessonsError.message}`)

  const { error } = await db
    .from('lesson_series')
    .delete()
    .eq('id', seriesId)
    .eq('organization_id', orgId)
  if (error) throw new Error(`Failed to delete series: ${error.message}`)

  return { deleted: footprint.removable.length }
}
