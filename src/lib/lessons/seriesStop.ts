import { DateTime } from 'luxon'
import { SERIES_CANCEL_REASON } from './renderCancelReason'

export function getSeriesStopBoundary(stopFromDate: string, timezone: string) {
  const stopDay = DateTime.fromISO(stopFromDate, { zone: timezone }).startOf('day')
  if (!stopDay.isValid) throw new Error('Invalid stop date')
  return {
    cutoffUtc: stopDay.toUTC().toISO()!,
    until: stopDay.minus({ days: 1 }).toISODate()!,
  }
}

export function isRemovableSeriesOccurrence(lesson: {
  status: string
  cancel_reason: string | null
}): boolean {
  return lesson.status === 'scheduled'
    || (lesson.status === 'cancelled' && lesson.cancel_reason === SERIES_CANCEL_REASON)
}
