import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getAvailableSlots, type AvailableSlot } from './getAvailableSlots'
import { getWeeklyQuotaStatus } from './weeklyQuota'

export interface AvailabilityBand {
  startAt: string
  endAt: string
}

export interface AvailabilityDaySummary {
  date: string
  hasAvailability: boolean
  freeIntervals: AvailabilityBand[]
}

export interface AvailabilitySummary {
  weekStart: string
  timezone: string
  durationMinutes: number
  days: AvailabilityDaySummary[]
  /** True when the student has used up their weekly quota for this week. */
  quotaExceeded?: boolean
}

export interface GetAvailabilitySummaryParams {
  teacherId: string
  organizationId: string
  durationMinutes: number
  weekStart?: string
  /** When given, weeks the student has already filled come back empty. */
  studentId?: string
}

export async function getAvailabilitySummary({
  teacherId,
  organizationId,
  durationMinutes,
  weekStart,
  studentId,
}: GetAvailabilitySummaryParams): Promise<AvailabilitySummary> {
  const db = createServiceRoleClient()
  const { data: org, error } = await db
    .from('organizations')
    .select('timezone')
    .eq('id', organizationId)
    .single()

  if (error || !org) {
    throw new Error(`Organization not found: ${organizationId}`)
  }

  const timezone = org.timezone ?? 'UTC'
  const normalizedWeekStart = normalizeWeekStart(weekStart, timezone)

  const dates = Array.from({ length: 7 }, (_, index) =>
    DateTime.fromISO(normalizedWeekStart, { zone: timezone })
      .plus({ days: index })
      .toISODate()!
  )

  // normalizeWeekStart already lands on Sunday in org time, so this summary week
  // is exactly one quota week — one check covers all seven days, and skipping
  // the fan-out saves seven availability queries.
  if (studentId) {
    const { atQuota } = await getWeeklyQuotaStatus({
      studentId,
      organizationId,
      slotStartUtc: DateTime.fromISO(normalizedWeekStart, { zone: timezone }).toUTC().toISO()!,
      timezone,
    })
    if (atQuota) {
      return {
        weekStart: normalizedWeekStart,
        timezone,
        durationMinutes,
        quotaExceeded: true,
        days: dates.map((date) => ({ date, hasAvailability: false, freeIntervals: [] })),
      }
    }
  }

  const slotsByDay = await Promise.all(
    dates.map((date) =>
      getAvailableSlots({
        teacherId,
        date,
        durationMinutes,
        organizationId,
      })
    )
  )

  return {
    weekStart: normalizedWeekStart,
    timezone,
    durationMinutes,
    days: dates.map((date, index) => {
      const freeIntervals = mergeSlotsIntoBands(slotsByDay[index])
      return {
        date,
        hasAvailability: freeIntervals.length > 0,
        freeIntervals,
      }
    }),
  }
}

export function mergeSlotsIntoBands(slots: AvailableSlot[]): AvailabilityBand[] {
  if (slots.length === 0) return []

  const sortedSlots = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt))
  const bands: AvailabilityBand[] = []

  for (const slot of sortedSlots) {
    const currentBand = bands[bands.length - 1]
    if (!currentBand) {
      bands.push({ startAt: slot.startAt, endAt: slot.endAt })
      continue
    }

    if (currentBand.endAt === slot.startAt) {
      currentBand.endAt = slot.endAt
      continue
    }

    bands.push({ startAt: slot.startAt, endAt: slot.endAt })
  }

  return bands
}

function normalizeWeekStart(weekStart: string | undefined, timezone: string): string {
  const baseDate = weekStart
    ? DateTime.fromISO(weekStart, { zone: timezone })
    : DateTime.now().setZone(timezone)

  if (!baseDate.isValid) {
    throw new Error(`Invalid weekStart: ${weekStart}`)
  }

  const daysFromSunday = baseDate.weekday % 7
  return baseDate.minus({ days: daysFromSunday }).startOf('day').toISODate()!
}
