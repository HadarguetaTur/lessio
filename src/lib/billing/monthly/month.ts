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

/**
 * Human-readable billing month (e.g. "April 2026" / "אפריל 2026") using app locale,
 * independent of the browser UI language for native month inputs.
 */
export function formatBillingMonthLabel(
  billingMonth: string,
  timeZone: string,
  intlLocale: string
): string {
  const dt = DateTime.fromFormat(billingMonth, 'yyyy-MM', { zone: timeZone })
  if (!dt.isValid) return billingMonth
  const anchor = dt.set({ day: 15, hour: 12, minute: 0, second: 0, millisecond: 0 })
  return new Intl.DateTimeFormat(intlLocale, {
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(anchor.toJSDate())
}

/** YYYY-MM values for a billing month dropdown, merging an out-of-range selection. */
export function getBillingMonthSelectOptionValues(
  timeZone: string,
  selectedMonth: string,
  pastMonths = 24,
  futureMonths = 12
): string[] {
  let center = DateTime.fromFormat(selectedMonth, 'yyyy-MM', { zone: timeZone })
  if (!center.isValid) {
    center = DateTime.now().setZone(timeZone).startOf('month')
  } else {
    center = center.startOf('month')
  }
  const start = center.minus({ months: pastMonths })
  const end = center.plus({ months: futureMonths })
  const out: string[] = []
  for (let d = start; d <= end; d = d.plus({ months: 1 })) {
    out.push(d.toFormat('yyyy-MM'))
  }
  const selected = DateTime.fromFormat(selectedMonth, 'yyyy-MM', { zone: timeZone })
  if (selected.isValid && !out.includes(selectedMonth)) {
    out.push(selectedMonth)
    out.sort()
  }
  return out
}
