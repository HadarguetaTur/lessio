/**
 * The little labels on a conversation row.
 *
 * Nothing here is typed by a person. Every tag is derived from facts the
 * product already holds — who wrote last, whether anyone answered, whether the
 * bot is muted, whether Meta's window is open, which teacher and group the
 * student belongs to, whether the family owes money. The audit's complaint was
 * that a studio owner opening the product could not tell what was going on;
 * these are the answers, on the row, before she clicks anything.
 *
 * Pure and ordered on purpose: which three tags survive the cap is a product
 * decision, so it belongs in a table a test can pin rather than in JSX.
 */

import type { InboxRow } from './rows'

/** A tag whose label is fixed copy under `inbox.tags.<id>`. */
export type StaticTagId =
  | 'awaiting_reply'
  | 'delivery_failed'
  | 'taken_over_by_me'
  | 'taken_over'
  | 'window_closed'
  | 'opted_out'
  | 'open_debt'
  | 'portal'
  | 'unknown_number'
  | 'bot_answered'
  | 'ai_answered'
  | 'broadcast'

export type InboxTag =
  /** Fixed copy under `inbox.tags.<id>`. */
  | { kind: 'static'; id: StaticTagId }
  /** A name out of the org's own data — a group or a teacher. */
  | { kind: 'group' | 'teacher'; name: string }

export type TagTone = 'attention' | 'active' | 'danger' | 'muted' | 'neutral'

/**
 * How urgent each tag is, high to low.
 *
 * The order is the whole point: a row can easily qualify for six tags, and the
 * three that get shown must be the three that change what the reader does. So
 * "waiting for an answer" and "the message failed" outrank "belongs to group
 * B", every time.
 */
const PRIORITY: StaticTagId[] = [
  'delivery_failed',
  'awaiting_reply',
  'taken_over_by_me',
  'taken_over',
  'opted_out',
  'window_closed',
  'open_debt',
  'unknown_number',
  'portal',
  'ai_answered',
  'bot_answered',
  'broadcast',
]

export const TAG_TONES: Record<StaticTagId, TagTone> = {
  delivery_failed: 'danger',
  awaiting_reply: 'attention',
  taken_over_by_me: 'active',
  taken_over: 'active',
  opted_out: 'muted',
  window_closed: 'muted',
  open_debt: 'attention',
  unknown_number: 'neutral',
  portal: 'neutral',
  ai_answered: 'neutral',
  bot_answered: 'neutral',
  broadcast: 'neutral',
}

/** How many tags a row shows before collapsing the rest into "+n". */
export const VISIBLE_TAG_LIMIT = 3

/**
 * Every tag that applies to a row, most urgent first.
 *
 * `viewerProfileId` separates "someone is handling this" from "I am handling
 * this" — the difference between a row you can ignore and a row you are on the
 * hook for.
 */
export function deriveTags(row: InboxRow, viewerProfileId: string): InboxTag[] {
  const ids = new Set<StaticTagId>()

  if (row.channel === 'portal') {
    ids.add('portal')
    if (row.awaitingReply) ids.add('awaiting_reply')
  } else {
    if (row.lastDeliveryStatus === 'failed') ids.add('delivery_failed')
    if (row.awaitingReply) ids.add('awaiting_reply')

    if (row.takenOver) {
      ids.add(row.takenOverByProfileId === viewerProfileId ? 'taken_over_by_me' : 'taken_over')
    }

    if (row.optedOut) ids.add('opted_out')

    // Only when someone might actually want to type: a closed window on a
    // quiet conversation is the normal state of things, not news. Closed while
    // they are waiting, or while you are holding the conversation, is news.
    if (!row.windowOpen && (row.awaitingReply || row.takenOver)) ids.add('window_closed')

    if (row.hasOpenDebt) ids.add('open_debt')
    if (row.senderRole === 'unknown') ids.add('unknown_number')

    // Who spoke last, when it was not a person. Answers "did anyone actually
    // deal with this, or did the bot just say something?"
    if (!row.lastInbound) {
      if (row.lastOrigin === 'ai') ids.add('ai_answered')
      else if (row.lastOrigin === 'bot' || row.lastOrigin === 'cron') ids.add('bot_answered')
      else if (row.lastOrigin === 'broadcast') ids.add('broadcast')
    }
  }

  const statics: InboxTag[] = PRIORITY.filter((id) => ids.has(id)).map((id) => ({
    kind: 'static' as const,
    id,
  }))

  // Named tags sort below every status tag — they say who this is, not what
  // needs doing.
  const named: InboxTag[] = []
  if (row.channel === 'whatsapp') {
    for (const name of row.groupNames) named.push({ kind: 'group', name })
    for (const name of row.teacherNames) named.push({ kind: 'teacher', name })
  }

  return [...statics, ...named]
}

/** The tags a row shows, and how many it had to hide. */
export function splitTags(tags: InboxTag[]): { visible: InboxTag[]; hidden: number } {
  return {
    visible: tags.slice(0, VISIBLE_TAG_LIMIT),
    hidden: Math.max(0, tags.length - VISIBLE_TAG_LIMIT),
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────

/** The chips above the list. `all` is not stored — it is the absence of a filter. */
export const INBOX_FILTERS = [
  'all',
  'awaiting',
  'taken_over',
  'parents',
  'students',
  'staff',
  'unknown',
  'portal',
] as const

export type InboxFilter = (typeof INBOX_FILTERS)[number]

export function parseInboxFilter(raw: string | undefined): InboxFilter {
  return INBOX_FILTERS.includes(raw as InboxFilter) ? (raw as InboxFilter) : 'all'
}

export function matchesFilter(row: InboxRow, filter: InboxFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'awaiting':
      return row.awaitingReply
    case 'taken_over':
      return row.channel === 'whatsapp' && row.takenOver
    case 'parents':
      return row.senderRole === 'parent'
    case 'students':
      return row.senderRole === 'student'
    case 'staff':
      return row.senderRole === 'teacher' || row.senderRole === 'staff'
    case 'unknown':
      return row.senderRole === 'unknown'
    case 'portal':
      return row.channel === 'portal'
  }
}
