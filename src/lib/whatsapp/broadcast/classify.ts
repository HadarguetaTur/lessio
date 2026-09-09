/**
 * Is this "service update" actually a promotion?
 *
 * Meta's categories are not a preference — sending marketing content under a
 * UTILITY template is a policy breach, and the cost lands on the org's number,
 * not on us. Owners do not read category definitions; they pick whichever option
 * lets them send. So the text itself is checked.
 *
 * Deterministic first, bilingual, and never blocking on the network: the word
 * list decides on its own, and the AI pass only runs when the org has a provider
 * configured and the heuristic was not already sure. A failed or slow AI call
 * degrades to the heuristic rather than holding up the send.
 */

import { getAiProvider } from '@/lib/ai-assistant/providers/factory'

export interface ClassifyBroadcastResult {
  promotional: boolean
  /** 'heuristic' when the word list decided, 'ai' when the model did. */
  source: 'heuristic' | 'ai'
  /** The term that triggered a heuristic match, for the message shown to the owner. */
  matched?: string
}

/**
 * Words that only appear when something is being sold or signed up for.
 *
 * Deliberately narrow. "חוג" or "class" alone is not promotional — every service
 * update mentions the class. What marks a promotion is an invitation to join,
 * buy, or take an offer.
 */
const PROMOTIONAL_TERMS: string[] = [
  // Hebrew
  'הרשמה',
  'להרשמה',
  'נרשמים',
  'מבצע',
  'הנחה',
  'הטבה',
  'מחיר מיוחד',
  'חיסכון',
  'קמפיין',
  'מספר המקומות מוגבל',
  'מקומות אחרונים',
  'הזדמנות אחרונה',
  'שריינו',
  'הצטרפו',
  'קורס חדש',
  'חוג חדש',
  'סדנה חדשה',
  'פותחים',
  'נפתח',
  // English
  'register now',
  'registration is open',
  'sign up',
  'discount',
  'special offer',
  'promotion',
  'limited spots',
  'last chance',
  'early bird',
  'save ',
  'book your',
  'join our new',
  'new course',
  'new class',
]

/** Percentages and currency amounts read as an offer in any language. */
const OFFER_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b\d{1,2}\s*%/, label: '%' },
  { re: /(₪|\bILS\b|\$)\s?\d/, label: '₪' },
]

/** The word-list pass. Exported for the tests and used as the AI's fallback. */
export function heuristicLooksPromotional(text: string): { promotional: boolean; matched?: string } {
  const normalized = text.toLowerCase()
  for (const term of PROMOTIONAL_TERMS) {
    if (normalized.includes(term.toLowerCase())) return { promotional: true, matched: term.trim() }
  }
  for (const { re, label } of OFFER_PATTERNS) {
    if (re.test(text)) return { promotional: true, matched: label }
  }
  return { promotional: false }
}

const SYSTEM_PROMPT = `You classify a message a tutoring business wants to send to parents on WhatsApp.
Answer with one word only: PROMOTIONAL or SERVICE.

PROMOTIONAL: invites the reader to register, buy, join something new, or take an offer, discount or limited-time deal.
SERVICE: informs about a lesson, class or arrangement the family already has — a change of time or room, a cancellation, an equipment reminder, a thank-you.

Messages may be in Hebrew or English. When unsure, answer SERVICE.`

/**
 * The full check: heuristic, then an AI second opinion when one is available.
 *
 * The heuristic can only say "promotional"; a clean text still goes to the model
 * where possible, because a promotion can be written without a single flagged
 * word ("יש לנו משהו חדש בשבילכם ביום ראשון, דברו איתנו").
 */
export async function classifyBroadcastText(
  orgId: string,
  text: string
): Promise<ClassifyBroadcastResult> {
  const heuristic = heuristicLooksPromotional(text)
  if (heuristic.promotional) {
    return { promotional: true, source: 'heuristic', matched: heuristic.matched }
  }

  try {
    const { provider } = await getAiProvider(orgId)
    const result = await provider.chat({
      systemPrompt: SYSTEM_PROMPT,
      history: [],
      userMessage: text,
      maxTokens: 5,
      temperature: 0,
    })
    const verdict = result.content.trim().toUpperCase()
    if (verdict.startsWith('PROMOTIONAL')) return { promotional: true, source: 'ai' }
    return { promotional: false, source: 'ai' }
  } catch {
    // No provider configured, or the model was unreachable. The heuristic
    // already said this text is fine, and a classification outage must not stop
    // an owner from telling parents a lesson moved.
    return { promotional: false, source: 'heuristic' }
  }
}
