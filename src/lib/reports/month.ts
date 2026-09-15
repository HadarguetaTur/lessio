import { DateTime } from 'luxon'

/**
 * Resolves the `?month=` param of a monthly report to a valid "YYYY-MM" in
 * the org timezone, falling back to the current month.
 */
export function resolveReportMonth(
  requested: string | undefined,
  timezone: string
): { month: string; currentMonth: string } {
  const currentMonth = DateTime.now().setZone(timezone).toFormat('yyyy-MM')
  const month =
    requested && /^\d{4}-\d{2}$/.test(requested) && DateTime.fromFormat(requested, 'yyyy-MM').isValid
      ? requested
      : currentMonth
  return { month, currentMonth }
}
