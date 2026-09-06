/**
 * Whether a slot collides with an availability exception (a blocked day or
 * blocked hours) — the write-path counterpart of the filtering
 * getAvailableSlots does at listing time.
 *
 * Deliberately narrow: it checks only the *blocks*, not "is the slot inside an
 * open window". An exception created between listing and confirm is the race
 * this closes; a weekly-grid edit mid-flow stays an accepted race, same as the
 * Google Calendar policy in decision #36.
 */

import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveDayWindows } from '@/lib/availability/resolveDayWindows'

export async function isSlotBlockedByOverride(params: {
  orgId: string
  teacherId: string
  startAtUtc: string
  endAtUtc: string
  /** Saves a lookup when the caller already has it. */
  timezone?: string
}): Promise<boolean> {
  const { orgId, teacherId, startAtUtc, endAtUtc } = params

  let timezone = params.timezone
  if (!timezone) {
    const db = createServiceRoleClient()
    const { data: org } = await db
      .from('organizations')
      .select('timezone')
      .eq('id', orgId)
      .single()
    timezone = (org?.timezone as string) ?? 'Asia/Jerusalem'
  }

  const startLocal = DateTime.fromISO(startAtUtc, { zone: 'utc' }).setZone(timezone)
  const endLocal = DateTime.fromISO(endAtUtc, { zone: 'utc' }).setZone(timezone)
  if (!startLocal.isValid || !endLocal.isValid) return false

  const date = startLocal.toISODate()!
  const day = await resolveDayWindows({ orgId, teacherId, date, timezone })

  if (day.fullDayBlocked) return true

  const start = startLocal.toFormat('HH:mm')
  // A slot ending exactly at midnight belongs to this date's evening, not the
  // next date's "00:00" — express it as the end of this day's clock.
  const end = endLocal.toISODate() === date ? endLocal.toFormat('HH:mm') : '24:00'

  return day.blocks.some((b) => start < b.end && end > b.start)
}
