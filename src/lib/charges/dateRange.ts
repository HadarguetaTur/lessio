import { DateTime } from 'luxon'

export interface ChargeDateRange {
  fromInclusive?: string
  toExclusive?: string
}

/** Convert date-input values into a full local-day range for a timestamptz query. */
export function getChargeDateRange(
  from: string | undefined,
  to: string | undefined,
  timezone: string
): ChargeDateRange {
  const fromDate = from ? DateTime.fromISO(from, { zone: timezone }) : null
  const toDate = to ? DateTime.fromISO(to, { zone: timezone }) : null

  return {
    fromInclusive:
      fromDate?.isValid ? (fromDate.startOf('day').toUTC().toISO() ?? undefined) : undefined,
    // An exclusive next-day boundary includes every timestamp in the selected
    // end date, including database values with sub-millisecond precision.
    toExclusive:
      toDate?.isValid
        ? (toDate.plus({ days: 1 }).startOf('day').toUTC().toISO() ?? undefined)
        : undefined,
  }
}
