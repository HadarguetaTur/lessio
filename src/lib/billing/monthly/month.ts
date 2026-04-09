import { DateTime } from 'luxon'

export function getCurrentBillingMonth(
  timezone: string,
  now = DateTime.now().setZone(timezone)
): string {
  return now.toFormat('yyyy-MM')
}

export function getBillingMonthRange(
  billingMonth: string,
  timezone: string
): {
  monthStart: DateTime
  monthEnd: DateTime
  monthStartUTC: string
  monthEndUTC: string
} {
  const monthStart = DateTime.fromFormat(billingMonth, 'yyyy-MM', {
    zone: timezone,
  }).startOf('month')
  const monthEnd = monthStart.plus({ months: 1 })

  return {
    monthStart,
    monthEnd,
    monthStartUTC: monthStart.toUTC().toISO()!,
    monthEndUTC: monthEnd.toUTC().toISO()!,
  }
}
