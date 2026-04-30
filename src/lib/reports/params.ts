import { DateTime } from 'luxon'

interface ParseReportMonthsOptions {
  defaultValue: number
  maxValue: number
  minValue?: number
}

/**
 * Parses the `months` query param used by report pages and CSV exports.
 * Invalid, blank, or non-finite values fall back to the report default.
 */
export function parseReportMonths(
  rawValue: string | null | undefined,
  { defaultValue, maxValue, minValue = 1 }: ParseReportMonthsOptions
): number {
  if (!rawValue || rawValue.trim() === '') {
    return defaultValue
  }

  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) {
    return defaultValue
  }

  const normalized = Math.trunc(parsed)
  return Math.min(Math.max(normalized, minValue), maxValue)
}

/**
 * Returns the UTC month-start for an inclusive rolling N-month window.
 * Example: months=3 in April includes Feb, Mar, Apr.
 */
export function getRollingMonthsStart(
  timezone: string,
  months: number,
  now = DateTime.now().setZone(timezone)
): string {
  return now.minus({ months: months - 1 }).startOf('month').toUTC().toISO()!
}
