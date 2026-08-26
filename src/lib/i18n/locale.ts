/**
 * App UI locales (next-intl cookie + messages).
 * Maps to BCP 47 for Intl / Luxon.
 */

export type AppLocale = 'he' | 'en'

export function parseAppLocale(value: string | undefined): AppLocale {
  return value === 'en' ? 'en' : 'he'
}

/**
 * Infers a language from free text — used on the WhatsApp path, where no
 * Accept-Language header exists (Meta's webhook POST carries no user locale).
 *
 * Any Hebrew letter wins, so a Hebrew speaker mixing in Latin words
 * ("שלח לי link") still gets Hebrew. Returns null when the text carries no
 * language signal at all — a bare "2" selecting a lesson from a numbered list,
 * an emoji reaction, a phone number — so those never flip a parent's language.
 */
export function detectLocaleFromText(text: string): AppLocale | null {
  if (/[֐-׿]/.test(text)) return 'he'
  if (/[A-Za-z]/.test(text)) return 'en'
  return null
}

/**
 * Picks the language to write to a recipient in.
 *
 * A clear signal in the message being answered wins, so a parent who switches
 * language is followed immediately. Otherwise the stored preference, then the
 * org default. Proactive sends (reminders) have no text and omit `detected`.
 */
export function resolveRecipientLocale(params: {
  stored?: string | null
  detected?: AppLocale | null
  orgDefault?: string | null
}): AppLocale {
  const { stored, detected, orgDefault } = params
  if (detected) return detected
  if (stored === 'he' || stored === 'en') return stored
  return parseAppLocale(orgDefault ?? undefined)
}

/**
 * `en-IL`, not `en-US`: the English UI is read by parents and teachers who live
 * in Israel, so dates must stay day-first. `en-US` rendered 12 August as
 * 08/12/2026, which an English-reading parent reads as 8 December — on a
 * payment due date that is a four-month error.
 */
export function toIntlLocale(locale: AppLocale): string {
  return locale === 'he' ? 'he-IL' : 'en-IL'
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
