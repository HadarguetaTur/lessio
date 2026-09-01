/**
 * Date-specific exceptions to the weekly availability grid.
 *
 * Three row kinds share the table, and several rows per date are legal:
 *
 *   block_day     — is_available false, no times: the whole date is closed
 *   block_range   — is_available false, with times: just those hours are closed
 *   special_hours — is_available true, with times: these replace the weekly grid
 *
 * Readers take the base windows (the special-hours rows if any, else the weekly
 * grid) and subtract every blocked range. See `subtractRanges` in
 * @/lib/availability/constants — the interval algebra is wall-clock strings on
 * purpose, so a range typed on a DST-transition day cannot drift.
 */

import { DateTime } from 'luxon'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizeTime } from '@/lib/availability/constants'
import { cancelAndNotify, type AbsenceWindow } from '@/lib/day-off/cancelForAbsence'

export interface AvailabilityOverride {
  id: string
  override_date: string
  is_available: boolean
  start_time: string | null
  end_time: string | null
  reason: string | null
  created_at: string
}

export type OverrideKind = 'block_day' | 'block_range' | 'special_hours'

/**
 * Why a write was rejected, as a key rather than a sentence: both routes and
 * their tests translate it themselves, so the rules live in one place while the
 * wording stays with next-intl. Mirrors `AvailabilityMutationError`.
 */
export type OverrideMutationError =
  | { key: 'pickDate' }
  | { key: 'fillTimes' }
  | { key: 'endAfterStart' }
  | { key: 'dayAlreadyBlocked' }
  | { key: 'overlappingRange' }
  | { key: 'overrideNotFound' }
  | { key: 'saveOverrideFailed' }
  | { key: 'updateOverrideFailed' }
  | { key: 'deleteOverrideFailed' }
  | { key: 'cancelLessonsFailed' }

/** A lesson already booked inside a range about to be closed. */
export interface ConflictingLesson {
  id: string
  /** HH:MM in org timezone */
  start: string
  end: string
  students: string[]
}

/**
 * Creating a block over booked lessons is a decision, not an error, so the
 * first submit reports them and writes nothing. The form then resubmits with
 * an explicit lesson_action.
 */
export type OverrideCreateResult =
  | OverrideMutationError
  | { needsLessonConfirm: true; lessons: ConflictingLesson[] }
  | { created: true; cancelled: number; notified: number }
  | null

export async function getTeacherOverrides(
  teacherId: string,
  organizationId: string
): Promise<AvailabilityOverride[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('availability_overrides')
    .select('id, override_date, is_available, start_time, end_time, reason, created_at')
    .eq('teacher_id', teacherId)
    .eq('organization_id', organizationId)
    .order('override_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

/** The kind a row represents, derived rather than stored. */
export function kindOf(row: Pick<AvailabilityOverride, 'is_available' | 'start_time'>): OverrideKind {
  if (row.is_available) return 'special_hours'
  return row.start_time ? 'block_range' : 'block_day'
}

interface ParsedForm {
  kind: OverrideKind
  date: string
  start: string | null
  end: string | null
  reason: string | null
}

function parseForm(formData: FormData): ParsedForm | OverrideMutationError {
  const date = String(formData.get('override_date') ?? '').trim()
  if (!date) return { key: 'pickDate' }

  const rawKind = String(formData.get('type') ?? '')
  const kind: OverrideKind =
    rawKind === 'special_hours' || rawKind === 'block_range' ? rawKind : 'block_day'

  const reason = String(formData.get('reason') ?? '').trim() || null

  if (kind === 'block_day') {
    return { kind, date, start: null, end: null, reason }
  }

  const start = String(formData.get('start_time') ?? '').trim()
  const end = String(formData.get('end_time') ?? '').trim()
  if (!start || !end) return { key: 'fillTimes' }
  if (start >= end) return { key: 'endAfterStart' }

  return { kind, date, start, end, reason }
}

function overlaps(
  a: { start: string; end: string },
  b: Pick<AvailabilityOverride, 'start_time' | 'end_time'>
): boolean {
  if (!b.start_time || !b.end_time) return false
  return a.start < normalizeTime(b.end_time) && a.end > normalizeTime(b.start_time)
}

/**
 * Whether a row may join the ones already on that date.
 *
 * A block that overlaps special hours is deliberately allowed — that pairing is
 * the whole model: "open 08:00–20:00 except 12:00–14:00". What is rejected is a
 * row that contradicts another of its own kind, or anything added to a date
 * that is already closed outright.
 */
function rejectConflict(
  parsed: ParsedForm,
  sameDate: AvailabilityOverride[],
  excludeId?: string
): OverrideMutationError | null {
  const others = sameDate.filter((o) => o.id !== excludeId)

  if (others.some((o) => kindOf(o) === 'block_day')) {
    // Anything layered on a closed day is a no-op the reader would misread.
    return { key: 'dayAlreadyBlocked' }
  }

  if (parsed.kind === 'block_day') {
    // Ranges and special hours underneath are superseded, not conflicting —
    // the caller clears them.
    return null
  }

  const range = { start: parsed.start as string, end: parsed.end as string }
  const sameKind = others.filter((o) => kindOf(o) === parsed.kind)
  if (sameKind.some((o) => overlaps(range, o))) return { key: 'overlappingRange' }

  return null
}

async function loadDate(
  organizationId: string,
  teacherId: string,
  date: string
): Promise<AvailabilityOverride[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('availability_overrides')
    .select('id, override_date, is_available, start_time, end_time, reason, created_at')
    .eq('teacher_id', teacherId)
    .eq('organization_id', organizationId)
    .eq('override_date', date)

  return data ?? []
}

/**
 * The UTC instants a blocked range covers, in the org's timezone.
 * A whole-day block spans midnight to midnight.
 */
async function absenceWindowFor(
  organizationId: string,
  teacherId: string,
  parsed: ParsedForm,
  teacherName: string | null
): Promise<AbsenceWindow | null> {
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', organizationId)
    .single()
  if (!org) return null

  const tz = (org.timezone as string) ?? 'Asia/Jerusalem'
  const dayStart = DateTime.fromISO(parsed.date, { zone: tz })
  if (!dayStart.isValid) return null

  const from = parsed.start
    ? DateTime.fromISO(`${parsed.date}T${parsed.start}`, { zone: tz })
    : dayStart.startOf('day')
  const to = parsed.end
    ? DateTime.fromISO(`${parsed.date}T${parsed.end}`, { zone: tz })
    : dayStart.plus({ days: 1 }).startOf('day')
  if (!from.isValid || !to.isValid) return null

  const date = dayStart.toFormat('dd/MM/yyyy')
  return {
    orgId: organizationId,
    teacherId,
    gte: from.toUTC().toISO()!,
    lt: to.toUTC().toISO()!,
    // Reuses the approved template's date_range slot: editing an approved
    // template resets it to PENDING at Meta, so the hours ride along here.
    label: parsed.start ? `${date}, ${parsed.start}–${parsed.end}` : date,
    teacherName,
  }
}

/**
 * Scheduled lessons OVERLAPPING the window — not merely starting inside it. A
 * lesson running 11:30-12:30 collides with a morning closed until 12:00.
 */
async function lessonsInWindow(window: AbsenceWindow, tz: string): Promise<ConflictingLesson[]> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('lessons')
    .select('id, start_at, end_at, lesson_students(student:students(full_name))')
    .eq('organization_id', window.orgId)
    .eq('teacher_id', window.teacherId)
    .eq('status', 'scheduled')
    .lt('start_at', window.lt)
    .gt('end_at', window.gte)
    .order('start_at')

  type Row = {
    id: string
    start_at: string
    end_at: string
    lesson_students: Array<{ student: { full_name: string } | null }> | null
  }

  return ((data ?? []) as unknown as Row[]).map((l) => ({
    id: l.id,
    start: DateTime.fromISO(l.start_at, { zone: 'utc' }).setZone(tz).toFormat('HH:mm'),
    end: DateTime.fromISO(l.end_at, { zone: 'utc' }).setZone(tz).toFormat('HH:mm'),
    students: (l.lesson_students ?? [])
      .map((ls) => ls.student?.full_name)
      .filter((n): n is string => Boolean(n)),
  }))
}

export async function createOverride(
  organizationId: string,
  teacherId: string,
  formData: FormData,
  teacherName: string | null = null
): Promise<OverrideCreateResult> {
  const parsed = parseForm(formData)
  if ('key' in parsed) return parsed

  const sameDate = await loadDate(organizationId, teacherId, parsed.date)
  const conflict = rejectConflict(parsed, sameDate)
  if (conflict) return conflict

  // 'cancel' | 'keep' | '' — absent on the first submit, which is what makes
  // the warning a decision point rather than a surprise.
  const lessonAction = String(formData.get('lesson_action') ?? '')
  const window =
    parsed.kind === 'special_hours'
      ? null
      : await absenceWindowFor(organizationId, teacherId, parsed, teacherName)

  if (window && !lessonAction) {
    const db = createServiceRoleClient()
    const { data: org } = await db
      .from('organizations')
      .select('timezone')
      .eq('id', organizationId)
      .single()
    const clashes = await lessonsInWindow(window, (org?.timezone as string) ?? 'Asia/Jerusalem')
    if (clashes.length > 0) return { needsLessonConfirm: true, lessons: clashes }
  }

  const supabase = await createClient()

  // Closing the whole day supersedes everything already on it, the same rule the
  // day-off approval applies.
  if (parsed.kind === 'block_day' && sameDate.length > 0) {
    const { error: clearError } = await supabase
      .from('availability_overrides')
      .delete()
      .eq('organization_id', organizationId)
      .eq('teacher_id', teacherId)
      .eq('override_date', parsed.date)
    if (clearError) return { key: 'saveOverrideFailed' }
  }

  const { error } = await supabase.from('availability_overrides').insert({
    organization_id: organizationId,
    teacher_id: teacherId,
    override_date: parsed.date,
    is_available: parsed.kind === 'special_hours',
    start_time: parsed.start,
    end_time: parsed.end,
    reason: parsed.reason,
  })

  if (error) {
    // The partial unique index on whole-day blocks.
    if (error.code === '23505') return { key: 'dayAlreadyBlocked' }
    return { key: 'saveOverrideFailed' }
  }

  // Cancelling runs after the block is written, so a failure here leaves the
  // hours closed rather than the lessons cancelled into an open calendar.
  if (window && lessonAction === 'cancel') {
    try {
      const { cancelled, notified } = await cancelAndNotify(window)
      return { created: true, cancelled, notified }
    } catch (err) {
      console.error('[overrides] Blocked the hours but could not cancel the lessons', {
        orgId: organizationId,
        err,
      })
      return { key: 'cancelLessonsFailed' }
    }
  }

  return null
}

export async function updateOverride(
  organizationId: string,
  teacherId: string,
  formData: FormData
): Promise<OverrideMutationError | null> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { key: 'overrideNotFound' }

  const parsed = parseForm(formData)
  if ('key' in parsed) return parsed

  const supabase = await createClient()

  // Read the row first, scoped by teacher: `teacherId` comes from the URL on
  // the owner route, so this is what stops one teacher's id from retiming
  // another's exception.
  const { data: row } = await supabase
    .from('availability_overrides')
    .select('id, override_date')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (!row) return { key: 'overrideNotFound' }

  const sameDate = await loadDate(organizationId, teacherId, parsed.date)
  const conflict = rejectConflict(parsed, sameDate, id)
  if (conflict) return conflict

  const { error } = await supabase
    .from('availability_overrides')
    .update({
      override_date: parsed.date,
      is_available: parsed.kind === 'special_hours',
      start_time: parsed.start,
      end_time: parsed.end,
      reason: parsed.reason,
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('teacher_id', teacherId)

  if (error) {
    if (error.code === '23505') return { key: 'dayAlreadyBlocked' }
    return { key: 'updateOverrideFailed' }
  }

  return null
}

export async function deleteOverride(
  organizationId: string,
  teacherId: string,
  formData: FormData
): Promise<OverrideMutationError | null> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { key: 'overrideNotFound' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('availability_overrides')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('teacher_id', teacherId)

  if (error) return { key: 'deleteOverrideFailed' }
  return null
}
