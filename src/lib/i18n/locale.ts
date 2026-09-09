/**
 * App UI locales (next-intl cookie + messages).
 * Maps to BCP 47 for Intl / Luxon.
 */

export type AppLocale = 'he' | 'en'

export function parseAppLocale(value: string | undefined): AppLocale {
  return value === 'en' ? 'en' : 'he'
}

/**
 * Latin-script words that are not evidence of anything.
 *
 * Israeli parents write these to a Hebrew business every day: English
 * loanwords that entered Hebrew whole ("ok", "thanks"), and Hebrew words
 * typed in Latin letters because the keyboard was in the wrong mode ("toda",
 * "beseder"). Counting them as English is what made a Hebrew-speaking parent
 * receive English reminders forever after typing "ok" once.
 *
 * The list is a filter on *evidence*, not a dictionary — a message made only
 * of these words simply carries no language signal, exactly like a bare "2".
 */
const AMBIGUOUS_LATIN_WORDS: ReadonlySet<string> = new Set([
  // English loanwords used verbatim in Hebrew conversation
  'ok', 'okay', 'okey', 'k', 'kk', 'yes', 'no', 'yep', 'yeah', 'sure',
  'thanks', 'thank', 'thx', 'tnx', 'ty', '10x', 'please', 'pls',
  'hi', 'hey', 'hello', 'bye', 'lol', 'wow', 'great', 'good', 'cool', 'nice',
  'sorry', 'super', 'perfect', 'amen',
  // Hebrew typed in Latin letters
  'toda', 'todah', 'todaraba', 'beseder', 'bseder', 'sababa', 'saba', 'ken',
  'lo', 'yalla', 'yala', 'shalom', 'ahalan', 'achi', 'ahi', 'mamash',
  'bevakasha', 'slicha', 'sliha', 'boker', 'tov', 'erev', 'laila', 'nu',
])

/**
 * How much a message says about the writer's language.
 *
 * `null` — nothing at all: no letters, or only ambiguous Latin words.
 * `weak` — enough to answer in ("yes please"), not enough to rewrite a profile.
 * `strong` — a real sentence, or any Hebrew script.
 *
 * Hebrew script is strong on its own: nobody types Hebrew letters by accident,
 * and a Hebrew word inside an otherwise-English message ("send me the מחיר")
 * still means the writer reads Hebrew.
 */
export type LocaleEvidence = { locale: AppLocale; strength: 'weak' | 'strong' } | null

export function localeEvidence(text: string): LocaleEvidence {
  const hebrewLetters = (text.match(/[֐-׿]/g) ?? []).length
  if (hebrewLetters > 0) {
    return { locale: 'he', strength: hebrewLetters >= 2 ? 'strong' : 'weak' }
  }

  const words = (text.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    (w) => !AMBIGUOUS_LATIN_WORDS.has(w)
  )
  const letters = words.join('').length
  if (letters === 0) return null
  // Two real words, or one long enough not to be an abbreviation, is a
  // sentence. Anything less is someone reaching for a word they happen to know.
  const strong = words.length >= 2 || letters >= 8
  return { locale: 'en', strength: strong ? 'strong' : 'weak' }
}

/**
 * The language to *answer* this message in — used on the WhatsApp path, where
 * no Accept-Language header exists (Meta's webhook POST carries no user locale).
 *
 * Any Hebrew letter wins, so a Hebrew speaker mixing in Latin words
 * ("שלח לי link") still gets Hebrew. Returns null when the text carries no
 * language signal — a bare "2" selecting a lesson from a numbered list, an
 * emoji reaction, a phone number, or a lone loanword like "ok" — so those never
 * flip the language of the reply.
 */
export function detectLocaleFromText(text: string): AppLocale | null {
  return localeEvidence(text)?.locale ?? null
}

/**
 * The language this message is evidence enough to *store* against a person.
 *
 * Deliberately stricter than the reply language. Answering in the language
 * someone just wrote in is polite and reversible; rewriting their stored
 * preference changes every reminder they will ever receive, so it needs a
 * sentence rather than a word.
 */
export function detectLocaleForPersistence(text: string): AppLocale | null {
  const evidence = localeEvidence(text)
  return evidence?.strength === 'strong' ? evidence.locale : null
}

/** Who wrote an inbound WhatsApp message, as far as language storage cares. */
export type LocaleWriterRole = 'parent' | 'student' | 'teacher' | 'staff' | 'unknown'

/**
 * Whether an inbound WhatsApp message may rewrite the sender's stored language,
 * and to what.
 *
 * Two rules, both learned the hard way:
 *
 *  - Staff are never touched. A profile's `preferred_locale` seeds the dashboard
 *    `locale` cookie at login, so an owner who texted "ok" to their own business
 *    number found the entire dashboard in English at their next sign-in. A
 *    dashboard language is chosen in the dashboard, in /settings, and nowhere
 *    else.
 *  - A parent's stored language is only overwritten by a full sentence, and a
 *    message that merely agrees with what is already stored writes nothing.
 *
 * Students have no locale column at all; their language stays per-message.
 */
export function resolvePersistedLocale(params: {
  role: LocaleWriterRole
  stored: string | null | undefined
  text: string
  /** True for a tapped button: presentation copy, never the writer's words. */
  isInteractiveReply?: boolean
}): AppLocale | null {
  if (params.role !== 'parent') return null
  if (params.isInteractiveReply) return null

  const detected = detectLocaleForPersistence(params.text)
  if (!detected) return null
  if (params.stored === detected) return null
  return detected
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
