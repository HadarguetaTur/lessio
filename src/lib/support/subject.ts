/**
 * Derives a ticket subject from the first thing the customer wrote.
 *
 * Neither intake channel has a subject line any more: WhatsApp never had one,
 * and the widget dropped it when it became a conversation — asking someone to
 * title their problem before describing it is a form's habit, not a chat's.
 * The operator queue still needs a one-line label, so it comes from the text.
 */

const SUBJECT_MAX = 80

export function subjectFrom(body: string): string {
  const firstLine = body.split('\n')[0]!.trim()
  // Stop at the first sentence end, so "It broke. I tried twice." titles as
  // "It broke." rather than running the whole paragraph into the queue.
  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0]!.trim()
  const candidate = firstSentence || firstLine || body.trim()

  return candidate.length <= SUBJECT_MAX ? candidate : candidate.slice(0, SUBJECT_MAX - 1) + '…'
}
