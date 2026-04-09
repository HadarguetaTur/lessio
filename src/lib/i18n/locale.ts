/**
 * App UI locales (next-intl cookie + messages).
 * Maps to BCP 47 for Intl / Luxon.
 */

export type AppLocale = 'he' | 'en'

export function parseAppLocale(value: string | undefined): AppLocale {
  return value === 'en' ? 'en' : 'he'
}

export function toIntlLocale(locale: AppLocale): string {
  return locale === 'he' ? 'he-IL' : 'en-US'
}

/** Luxon setLocale expects short codes */
export function toLuxonLocale(locale: AppLocale): string {
  return locale === 'he' ? 'he' : 'en'
}

/**
 * Human-readable span for a Sun–Sat week given the week's Sunday as YYYY-MM-DD (noon-UTC anchor).
 */
export function formatWeekRangeLabel(weekStr: string, locale: AppLocale): string {
  const intlLoc = toIntlLocale(locale)
  const startDate = new Date(`${weekStr}T12:00:00Z`)
  const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)
  const fmt = new Intl.DateTimeFormat(intlLoc, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  if (typeof fmt.formatRange === 'function') {
    return fmt.formatRange(startDate, endDate)
  }
  const startDay = startDate.getUTCDate()
  const endDay = endDate.getUTCDate()
  const monthYear = new Intl.DateTimeFormat(intlLoc, {
    month: 'long',
    year: 'numeric',
  }).format(endDate)
  return `${startDay}–${endDay} ${monthYear}`
}
