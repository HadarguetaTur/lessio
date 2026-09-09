/**
 * createLessonSeries — server-only series creation logic.
 * Per /docs/sprint-11-scope.md § Story 2.
 *
 * Not a Server Action module: `orgId` is a caller-supplied argument and the
 * queries run on the service-role client, so a `'use server'` directive here
 * would publish an unauthenticated cross-tenant write. Call it only from an
 * action that has resolved the org from the session.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { LessonType } from '@/lib/lessons/types'
import { assertLessonPeopleBelongToOrg } from './assertLessonPeople'
import { assertOrgNotSaasReadOnly } from '@/lib/saas/subscriptions'
import { assertSlotBookable, SlotNotBookableError } from '@/lib/booking/assertSlotBookable'

export type SeriesFrequency = 'weekly' | 'biweekly'

/**
 * How far ahead a series may run, and how many occurrences it may generate.
 *
 * `until` was unbounded (SCHED-08): the schema proved it was a date and
 * nothing else, so "2099-12-31" generated ~3,800 lessons one INSERT at a time.
 * The request times out long before it finishes, and because the lesson_series
 * row is written first and there is no transaction, what survives is a series
 * with an arbitrary number of occurrences that nobody asked for and nothing
 * rolls back.
 *
 * The occurrence cap is the backstop, not the message: the actions reject a
 * too-far `until` with something a person can read. Two years of weekly
 * lessons is 105 occurrences, so the cap only bites on input the UI refuses.
 */
export const MAX_SERIES_HORIZON_MONTHS = 24
export const MAX_SERIES_OCCURRENCES = 130

/** Series can repeat any lesson type; a group series enrols the group's roster at creation time. */
export type SeriesLessonType = LessonType

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
  /** The roster every occurrence enrols: one student for individual, two for pair. */
  studentIds: string[]
  rule: SeriesRule
  createdByProfileId: string
  lessonType?: SeriesLessonType
  /** Per-student price; required for custom, optional override for pair/group. */
  pricePerStudent?: number | null
  /** The student group a group series was built from; stored on the series and every lesson. */
  groupId?: string | null
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
  const {
    orgId,
    teacherId,
    studentIds,
    rule,
    createdByProfileId,
    lessonType = 'individual',
    pricePerStudent = null,
    groupId = null,
  } = params
  const db = createServiceRoleClient()

  if (studentIds.length === 0) throw new Error('At least one student is required')

  // `createLesson` refuses a lapsed org here; the series builder did not, so
  // the cheaper single lesson was blocked while the 130-lesson version was not.
  await assertOrgNotSaasReadOnly(orgId)

  // Same reasoning as createLesson: teacherId and studentIds arrive from the
  // new-series form and every row written below is stamped with orgId, so a
  // foreign id would mint a whole recurring series against another tenant's
  // teacher or students. Checked before the lesson_series row is inserted —
  // this function writes the series first and generates occurrences in a
  // loop, so a late rejection would leave a series row behind even when
  // every occurrence failed.
  await assertLessonPeopleBelongToOrg(orgId, teacherId, studentIds, groupId)

  const seriesGroupId = lessonType === 'group' ? groupId : null

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
      // lesson_series.student_id is the display/primary student; the real
      // roster lives on each generated lesson's lesson_students rows.
      student_id: studentIds[0],
      group_id: seriesGroupId,
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
  while (cursor <= until && candidates.length < MAX_SERIES_OCCURRENCES) {
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

    // d. Check student lesson overlap (status != 'cancelled') — every student
    //    on the roster must be free, not just the first.
    let studentBusy = false
    for (const studentId of studentIds) {
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
          studentBusy = true
          break
        }
      }
    }

    if (studentBusy) {
      skipped++
      conflicts.push(dateStr)
      continue
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

    // e2. The same write-time authority the parent booking path uses.
    // `createSeriesAction` runs quota, duration and horizon and then came
    // straight here — so the series builder never read `availability_overrides`
    // at all, while the single-lesson form one directory over does. Same
    // business action, same UI affordance, three fewer guards.
    //
    // A blocked date is a CONFLICT, matching every other skip in this loop:
    // one closed week must not abandon the rest of the term.
    try {
      await assertSlotBookable({
        orgId,
        teacherId,
        startUtc,
        endUtc,
        audience: 'admin',
        skipMinNotice: true,
      })
    } catch (err) {
      if (err instanceof SlotNotBookableError) {
        skipped++
        conflicts.push(dateStr)
        continue
      }
      throw err
    }

    // f. Insert lesson
    const lessonPayload: Record<string, unknown> = {
      organization_id: orgId,
      teacher_id: teacherId,
      start_at: startUtc,
      end_at: endUtc,
      status: 'scheduled',
      series_id: seriesId,
      lesson_type: lessonType,
      max_students: studentIds.length,
    }
    if (pricePerStudent != null) lessonPayload.price_per_student = pricePerStudent
    if (seriesGroupId) lessonPayload.group_id = seriesGroupId

    const { data: lesson, error: lessonError } = await db
      .from('lessons')
      .insert(lessonPayload)
      .select('id')
      .single()

    if (lessonError || !lesson) {
      skipped++
      conflicts.push(dateStr)
      continue
    }

    // g. Insert lesson_students
    const { error: lsError } = await db.from('lesson_students').insert(
      studentIds.map((studentId) => ({
        lesson_id: lesson.id,
        student_id: studentId,
        organization_id: orgId,
      }))
    )

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
