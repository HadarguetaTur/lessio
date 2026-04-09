import { type AppLocale, toIntlLocale } from '@/lib/i18n/locale'

/** Format a UTC ISO timestamp as HH:MM in the given timezone. */
export function formatTime(iso: string, timezone: string, locale: AppLocale = 'he'): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** Format a UTC ISO timestamp as a full calendar date in the given timezone. */
export function formatDate(iso: string, timezone: string, locale: AppLocale = 'he'): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}
