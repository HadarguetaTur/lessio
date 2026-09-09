/**
 * Deterministic reply classification. Pure, bilingual (he/en), no LLM.
 *
 * Two rules make this safe enough to drive suppression automatically:
 *
 * 1. Quoted text is stripped first. A reply carries the cold email underneath
 *    it, and that email says "demo" and "interested" — without stripping,
 *    every reply would classify positive.
 * 2. Positive and negative signals are *scored*, not ordered. "לא רע בכלל,
 *    אשמח לראות" and "No problem, send it over" contain a negative token and a
 *    positive phrase; ordering rules would call them not_interested and
 *    suppress a warm lead. Ambiguity resolves to `unknown`, which costs a
 *    human one glance on the dashboard. The hard classes (bounce, auto-reply,
 *    unsubscribe) still win outright.
 */

import type { ReplyClassification } from './types'

export interface ClassifyInput {
  fromEmail?: string | null
  subject?: string | null
  bodyText: string
}

export interface ClassifyResult {
  classification: ReplyClassification
  /** The de-quoted, trimmed text the decision was made on — stored for the dashboard. */
  snippet: string
}

const QUOTE_CUTS: RegExp[] = [
  /^On .{0,200}wrote:\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^-{2,}\s*Forwarded message\s*-{2,}/im,
  /^בתאריך .{0,200}(כתב|מאת)/m,
  /^ב-.{0,200}כתב\/ה:/m,
  /^From:\s.+$/m,
  /^מאת:\s.+$/m,
  /^Sent from my (iPhone|iPad|Galaxy|Samsung)/im,
  /^נשלח מה-?iPhone שלי/m,
]

/** Drops quoted history and signature noise, keeps what the person typed. */
export function stripQuotedText(body: string): string {
  let text = body.replace(/\r\n?/g, '\n')
  // Everything from the first quote marker down is history.
  let cut = text.length
  for (const re of QUOTE_CUTS) {
    const m = re.exec(text)
    if (m && m.index < cut) cut = m.index
  }
  text = text.slice(0, cut)
  // Lines quoted with '>' are history too, wherever they sit.
  text = text
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

const BOUNCE_FROM = /(mailer-daemon|postmaster|mail-delivery|no-?reply@.*(google|outlook|microsoft))/i
const BOUNCE_SUBJECT = /(undeliver|delivery (status|failed|failure|has failed)|mail delivery|returned mail|failure notice|לא ניתן למסור)/i
const BOUNCE_BODY = /(address not found|user unknown|does not exist|no such user|550[ -]|recipient rejected|mailbox unavailable)/i

const AUTO_SUBJECT = /^(re:\s*)?(auto(matic)?[ -]?reply|automatic response|out of (the )?office|תשובה אוטומטית|מענה אוטומטי)/i
const AUTO_BODY = /(out of (the )?office|currently (away|out of)|on (annual|parental|maternity) leave|will (be back|return|respond when)|limited access to (my )?email|auto(matic)?[ -]?reply|תשובה אוטומטית|מענה אוטומטי|מחוץ למשרד|בחופשה|אחזור ב|אשוב ב)/i

const UNSUBSCRIBE = /(\bunsubscribe\b|\bremove me\b|\bopt[ -]?out\b|\bdo not (email|contact|write)\b|\bdon'?t (email|contact|write)\b|\bstop (emailing|sending|contacting)\b|^stop[.!]?$|\btake me off\b|הסר אותי|הסירו אותי|הסירי אותי|תסירו אותי|תסירי אותי|תסיר אותי|להסיר אותי|תורידו אותי|תורידי אותי|להסרה מהרשימה|תפסיקו|אל תשלחו|אל תפנו|הסרה מרשימת|להסרה)/i

const NEGATIVE: RegExp[] = [
  /\bnot interested\b/i,
  /\bno,? thanks?\b/i,
  /\bno thank you\b/i,
  /\bnot (right )?now\b/i,
  /\bnot relevant\b/i,
  /\bnot for (me|us)\b/i,
  /\bwrong person\b/i,
  /\bno longer\b/i,
  /\bnot looking\b/i,
  /\bnot a fit\b/i,
  /\bnot the right time\b/i,
  /^no[.!]?$/i,
  /לא מעוניין/,
  /לא מעוניינת/,
  /לא מעוניינים/,
  /לא רלוונטי/,
  /לא תודה/,
  /לא כרגע/,
  /לא מתאים/,
  /לא צריך/,
  /לא צריכה/,
  /^לא[.!]?$/,
]

const POSITIVE: RegExp[] = [
  /^(yes|yeah|yep|yup|sure|ok(ay)?|absolutely|definitely)\b/i,
  /\binterested\b/i,
  /\btell me more\b/i,
  /\bmore (info|information|details)\b/i,
  /\bsounds? (good|great|interesting)\b/i,
  /\blet'?s (talk|chat|do it|schedule)\b/i,
  /\bsend (it|me|over|the|a)\b/i,
  /\b(schedule|book) (a )?(call|demo|meeting|time)\b/i,
  /\bcall me\b/i,
  /\bwould love\b/i,
  /\bhappy to\b/i,
  /\bhow (does it|much|do i)\b/i,
  /\bdemo\b/i,
  // `\b` is ASCII-only in JS regexes without the `u` flag, so Hebrew words
  // need an explicit boundary.
  /^כן(?:$|[\s,.!?])/,
  /^בטח(?:$|[\s,.!?])/,
  /^בשמחה(?:$|[\s,.!?])/,
  /מעניין/,
  /מעוניין/,
  /מעוניינת/,
  /מעוניינים/,
  /ספרו לי/,
  /ספר לי/,
  /פרטים/,
  /אשמח/,
  /בשמחה/,
  /דמו/,
  /תתקשרו/,
  /תתקשר/,
  /אפשר לשמוע/,
  /נשמע טוב/,
  /נשמע מעניין/,
  /איך זה עובד/,
  /כמה זה עולה/,
]

function countHits(patterns: RegExp[], text: string): number {
  let n = 0
  for (const re of patterns) if (re.test(text)) n++
  return n
}

export function classifyReply(input: ClassifyInput): ClassifyResult {
  const from = (input.fromEmail ?? '').trim()
  const subject = (input.subject ?? '').trim()
  const stripped = stripQuotedText(input.bodyText ?? '')
  const snippet = stripped.slice(0, 400)
  const text = snippet.toLowerCase().replace(/\s+/g, ' ').trim()

  if (BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(subject) || BOUNCE_BODY.test(text)) {
    return { classification: 'bounce', snippet }
  }
  if (AUTO_SUBJECT.test(subject) || AUTO_BODY.test(text)) {
    return { classification: 'auto_reply', snippet }
  }
  if (UNSUBSCRIBE.test(text)) {
    return { classification: 'unsubscribe', snippet }
  }

  // Negative phrases contain positive words ("not interested" ⊃ "interested",
  // "לא מעוניין" ⊃ "מעוניין"), so positives are scored on what is left once
  // the negatives are blanked out.
  const neg = countHits(NEGATIVE, text)
  const remainder = NEGATIVE.reduce((t, re) => t.replace(re, ' '), text)
  const pos = countHits(POSITIVE, remainder)

  if (pos > 0 && neg === 0) return { classification: 'interested', snippet }
  if (neg > 0 && pos === 0) return { classification: 'not_interested', snippet }
  return { classification: 'unknown', snippet }
}
