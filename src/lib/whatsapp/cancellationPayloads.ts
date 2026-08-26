/**
 * Reply payloads for the interactive cancellation flow (`c:` namespace).
 *
 * Like the day-off flow's `d:` payloads, every step is stateless: the payload
 * carries the lesson id, so a tap works even after the 10-minute typed-number
 * session has expired, and executeCancellation re-validates everything before
 * committing. The session row survives only so a typed "1" answering the text
 * fallback keeps working.
 *
 * The decoder returns null for anything that is not a `c:` payload, so a
 * foreign reply id falls through to normal intent handling. Whether the sender
 * may cancel the decoded lesson is a separate question answered in the handler:
 * a reply id is client-supplied, and could name a lesson the sender was never
 * shown.
 */

const PREFIX = 'c'

/** Lesson rows per list page — 8 leaves room for a "more lessons" row. */
export const CANCEL_PAGE_SIZE = 8

/**
 * Highest accepted page offset. Eligibility spans one week, so anything past
 * this is a corrupted or forged payload, not a real page.
 */
const MAX_PAGE_OFFSET = 200

export type CancellationPayload =
  /** A lesson row was tapped — ask to confirm. */
  | { step: 'pick'; lessonId: string }
  /** Confirmed — cancel the lesson. */
  | { step: 'confirm'; lessonId: string }
  /** Backed out — close the flow without cancelling. */
  | { step: 'abort' }
  /** Show the next page of eligible lessons. */
  | { step: 'page'; offset: number }

// ── Encoding ──────────────────────────────────────────────────────────────────

export function encodeCancellationPayload(payload: CancellationPayload): string {
  switch (payload.step) {
    case 'pick':
      return `${PREFIX}:pick:${payload.lessonId}`
    case 'confirm':
      return `${PREFIX}:confirm:${payload.lessonId}`
    case 'abort':
      return `${PREFIX}:abort`
    case 'page':
      return `${PREFIX}:page:${payload.offset}`
  }
}

// ── Decoding ──────────────────────────────────────────────────────────────────

export function decodeCancellationPayload(
  replyId: string | undefined
): CancellationPayload | null {
  if (!replyId) return null
  const parts = replyId.split(':')
  if (parts[0] !== PREFIX || parts.length < 2) return null

  switch (parts[1]) {
    case 'abort':
      return parts.length === 2 ? { step: 'abort' } : null

    case 'pick':
    case 'confirm': {
      if (parts.length !== 3) return null
      const lessonId = parts[2]
      // Shape check only — that the lesson exists, is still cancellable and
      // belongs to this sender is re-checked against the database.
      if (!/^[0-9a-f-]{36}$/i.test(lessonId)) return null
      return parts[1] === 'pick'
        ? { step: 'pick', lessonId }
        : { step: 'confirm', lessonId }
    }

    case 'page': {
      if (parts.length !== 3) return null
      if (!/^\d{1,3}$/.test(parts[2])) return null
      const offset = Number(parts[2])
      return offset > MAX_PAGE_OFFSET ? null : { step: 'page', offset }
    }

    default:
      return null
  }
}
