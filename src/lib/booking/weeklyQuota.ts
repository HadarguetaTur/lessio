/**
 * weeklyQuota — enforces students.weekly_quota during booking.
 *
 * A week runs Sunday→Saturday in the org's timezone. The quota counts
 * non-cancelled lessons the student is enrolled in, so cancelling a lesson
 * frees the slot back up and the parent can re-book.
 *
 * Every enforcement layer (bot, availability, slot lock, confirm) goes through
 * getWeeklyQuotaStatus, so organizations.enforce_weekly_quota switches the
 * whole feature off in one place.
 *
 * Uses service role — never called from client components.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export class WeeklyQuotaExceededError extends Error {
  constructor(
    public readonly quota: number,
    public readonly count: number
  ) {
    super(`Student already has ${count} lesson(s) this week (quota: ${quota})`)
    this.name = 'WeeklyQuotaExceededError'
  }
}

export interface WeekBounds {
  /** Inclusive start of the Sunday→Saturday week, as a UTC ISO string. */
  startUtc: string
  /** Exclusive end (the following Sunday), as a UTC ISO string. */
  endUtc: string
}

export interface WeeklyQuotaStatus {
  quota: number | null
  count: number
  atQuota: boolean
}

export interface WeeklyQuotaParams {
  studentId: string
  organizationId: string
  /** Any instant inside the target week — the slot's start, or now for the bot. */
  slotStartUtc: string
  /** Org timezone; loaded from organizations when omitted. */
  timezone?: string
}

/**
 * The Sunday→Saturday week containing `instantUtcIso`, in `timezone`.
 * Sunday is derived the same way as getAvailableSlots/getAvailabilitySummary:
 * luxon weekday is 1=Mon…7=Sun, so `weekday % 7` gives days since Sunday.
 */
export function weekBoundsFor(instantUtcIso: string, timezone: string): WeekBounds {
  const local = DateTime.fromISO(instantUtcIso, { zone: 'utc' }).setZone(timezone)
  if (!local.isValid) throw new Error(`Invalid instant: ${instantUtcIso}`)

  const daysFromSunday = local.weekday % 7
  const start = local.minus({ days: daysFromSunday }).startOf('day')
  const end = start.plus({ days: 7 })

  return {
    startUtc: start.toUTC().toISO()!,
    endUtc: end.toUTC().toISO()!,
  }
}

export async function getWeeklyQuotaStatus({
  studentId,
  organizationId,
  slotStartUtc,
  timezone,
}: WeeklyQuotaParams): Promise<WeeklyQuotaStatus> {
  const db = createServiceRoleClient()

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('timezone, enforce_weekly_quota')
    .eq('id', organizationId)
    .single()

  if (orgError || !org) throw new Error(`Organization not found: ${organizationId}`)

  if (!org.enforce_weekly_quota) return { quota: null, count: 0, atQuota: false }

  const { data: student, error: studentError } = await db
    .from('students')
    .select('weekly_quota')
    .eq('id', studentId)
    .eq('organization_id', organizationId)
    .single()

  if (studentError || !student) throw new Error(`Student not found: ${studentId}`)

  const quota = student.weekly_quota ?? null
  if (quota === null) return { quota: null, count: 0, atQuota: false }

  const { startUtc, endUtc } = weekBoundsFor(slotStartUtc, timezone ?? org.timezone ?? 'UTC')

  // Inner join keeps this to a single round trip: rows come back only for
  // lessons that are both the student's and inside the week.
  const { data: rows, error: countError } = await db
    .from('lesson_students')
    .select('lesson_id, lessons!inner(id)')
    .eq('student_id', studentId)
    .eq('organization_id', organizationId)
    .neq('lessons.status', 'cancelled')
    .gte('lessons.start_at', startUtc)
    .lt('lessons.start_at', endUtc)

  if (countError) throw new Error(`Failed to count weekly lessons: ${countError.message}`)

  const count = rows?.length ?? 0
  return { quota, count, atQuota: count >= quota }
}

/**
 * Whether this org enforces the weekly quota — the student card hides the quota
 * field when it does not, so nobody fills in a number that does nothing.
 */
export async function orgEnforcesWeeklyQuota(organizationId: string): Promise<boolean> {
  const db = createServiceRoleClient()
  const { data } = await db
    .from('organizations')
    .select('enforce_weekly_quota')
    .eq('id', organizationId)
    .maybeSingle()

  return (data as { enforce_weekly_quota: boolean } | null)?.enforce_weekly_quota ?? true
}

export async function assertWeeklyQuotaNotExceeded(params: WeeklyQuotaParams): Promise<void> {
  const status = await getWeeklyQuotaStatus(params)
  if (status.atQuota) throw new WeeklyQuotaExceededError(status.quota!, status.count)
}
