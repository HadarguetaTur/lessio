import { describe, it, expect } from 'vitest'
import {
  deriveTags,
  splitTags,
  matchesFilter,
  parseInboxFilter,
  VISIBLE_TAG_LIMIT,
  type InboxTag,
} from './tags'
import type { InboxRow, WhatsAppRow, PortalRow } from './rows'

const ME = 'profile-me'
const SOMEONE_ELSE = 'profile-other'

/** A quiet, healthy parent conversation — the baseline every case deviates from. */
function waRow(over: Partial<WhatsAppRow> = {}): WhatsAppRow {
  return {
    channel: 'whatsapp',
    key: 'wa:+972500000001',
    href: '/messages/whatsapp/%2B972500000001',
    phone: '+972500000001',
    displayName: 'רות לוי',
    fallbackLabel: '+972500000001',
    senderRole: 'parent',
    lastMessage: 'תודה!',
    lastMessageAt: '2026-09-10T09:00:00Z',
    awaitingReply: false,
    takenOver: false,
    takenOverBy: null,
    takenOverByProfileId: null,
    lastOrigin: 'staff',
    lastInbound: false,
    lastDeliveryStatus: 'delivered',
    lastErrorCode: null,
    windowOpen: true,
    parentId: 'parent-1',
    studentNames: ['נועה לוי'],
    teacherNames: [],
    groupNames: [],
    optedOut: false,
    hasOpenDebt: false,
    ...over,
  }
}

function portalRow(over: Partial<PortalRow> = {}): PortalRow {
  return {
    channel: 'portal',
    key: 'portal:student-1',
    href: '/messages/student-1',
    studentId: 'student-1',
    studentName: 'נועה לוי',
    parentName: 'רות לוי',
    displayName: 'רות לוי',
    fallbackLabel: 'נועה לוי',
    lastMessage: 'מתי השיעור?',
    lastMessageAt: '2026-09-10T08:00:00Z',
    awaitingReply: false,
    unreadCount: 0,
    senderRole: 'parent',
    lastOrigin: null,
    takenOver: false,
    windowOpen: true,
    ...over,
  }
}

const staticIds = (tags: InboxTag[]) =>
  tags.filter((t) => t.kind === 'static').map((t) => (t as { id: string }).id)

describe('deriveTags — what a row is saying', () => {
  it('says nothing about a healthy, answered conversation', () => {
    expect(deriveTags(waRow(), ME)).toEqual([])
  })

  it('flags a conversation nobody has answered', () => {
    const tags = deriveTags(waRow({ awaitingReply: true, lastInbound: true }), ME)
    expect(staticIds(tags)).toContain('awaiting_reply')
  })

  it('separates "I am handling this" from "someone is"', () => {
    const mine = waRow({ takenOver: true, takenOverByProfileId: ME })
    const theirs = waRow({ takenOver: true, takenOverByProfileId: SOMEONE_ELSE })
    expect(staticIds(deriveTags(mine, ME))).toContain('taken_over_by_me')
    expect(staticIds(deriveTags(theirs, ME))).toContain('taken_over')
    expect(staticIds(deriveTags(theirs, ME))).not.toContain('taken_over_by_me')
  })

  it('names who spoke last when it was not a person', () => {
    expect(staticIds(deriveTags(waRow({ lastOrigin: 'ai' }), ME))).toContain('ai_answered')
    expect(staticIds(deriveTags(waRow({ lastOrigin: 'bot' }), ME))).toContain('bot_answered')
    expect(staticIds(deriveTags(waRow({ lastOrigin: 'cron' }), ME))).toContain('bot_answered')
    expect(staticIds(deriveTags(waRow({ lastOrigin: 'broadcast' }), ME))).toContain('broadcast')
    // A staff reply is the normal case and needs no label.
    expect(staticIds(deriveTags(waRow({ lastOrigin: 'staff' }), ME))).not.toContain('bot_answered')
  })

  it('never credits the bot for an inbound message', () => {
    const tags = deriveTags(waRow({ lastInbound: true, lastOrigin: 'bot', awaitingReply: true }), ME)
    expect(staticIds(tags)).not.toContain('bot_answered')
  })

  it('mentions a closed window only when someone might want to type', () => {
    // Quiet and closed is the normal state of things, not news.
    expect(staticIds(deriveTags(waRow({ windowOpen: false }), ME))).not.toContain('window_closed')
    // Waiting on us, and we cannot freely answer.
    expect(
      staticIds(deriveTags(waRow({ windowOpen: false, awaitingReply: true }), ME))
    ).toContain('window_closed')
    // Being held by a person who cannot type.
    expect(
      staticIds(deriveTags(waRow({ windowOpen: false, takenOver: true }), ME))
    ).toContain('window_closed')
  })

  it('flags a failed delivery, an opt-out, a debt and a stranger', () => {
    expect(staticIds(deriveTags(waRow({ lastDeliveryStatus: 'failed' }), ME))).toContain('delivery_failed')
    expect(staticIds(deriveTags(waRow({ optedOut: true }), ME))).toContain('opted_out')
    expect(staticIds(deriveTags(waRow({ hasOpenDebt: true }), ME))).toContain('open_debt')
    expect(staticIds(deriveTags(waRow({ senderRole: 'unknown' }), ME))).toContain('unknown_number')
  })

  it('marks a portal conversation as such', () => {
    expect(staticIds(deriveTags(portalRow(), ME))).toEqual(['portal'])
    expect(staticIds(deriveTags(portalRow({ awaitingReply: true, unreadCount: 2 }), ME))).toEqual([
      'awaiting_reply',
      'portal',
    ])
  })

  it('carries group and teacher names, after every status tag', () => {
    const tags = deriveTags(
      waRow({ awaitingReply: true, groupNames: ['גיטרה מתחילים'], teacherNames: ['דנה'] }),
      ME
    )
    expect(tags[0]).toEqual({ kind: 'static', id: 'awaiting_reply' })
    expect(tags).toContainEqual({ kind: 'group', name: 'גיטרה מתחילים' })
    expect(tags).toContainEqual({ kind: 'teacher', name: 'דנה' })
    // Names sort below every status tag — they say who this is, not what to do.
    const firstNamed = tags.findIndex((t) => t.kind !== 'static')
    const lastStatic = tags.map((t) => t.kind === 'static').lastIndexOf(true)
    expect(firstNamed).toBeGreaterThan(lastStatic)
  })
})

describe('deriveTags — priority', () => {
  it('puts the tags that change what you do first', () => {
    // A row that qualifies for almost everything at once.
    const busy = waRow({
      lastDeliveryStatus: 'failed',
      awaitingReply: true,
      takenOver: true,
      takenOverByProfileId: ME,
      optedOut: true,
      windowOpen: false,
      hasOpenDebt: true,
      groupNames: ['קבוצה'],
    })
    const ids = staticIds(deriveTags(busy, ME))
    expect(ids.slice(0, 3)).toEqual(['delivery_failed', 'awaiting_reply', 'taken_over_by_me'])
    expect(ids.indexOf('open_debt')).toBeGreaterThan(ids.indexOf('opted_out'))
  })

  it('shows three and counts the rest', () => {
    const busy = waRow({
      lastDeliveryStatus: 'failed',
      awaitingReply: true,
      optedOut: true,
      hasOpenDebt: true,
      groupNames: ['קבוצה'],
    })
    const { visible, hidden } = splitTags(deriveTags(busy, ME))
    expect(visible).toHaveLength(VISIBLE_TAG_LIMIT)
    expect(hidden).toBeGreaterThan(0)
    expect(staticIds(visible)).toEqual(['delivery_failed', 'awaiting_reply', 'opted_out'])
  })

  it('hides nothing when a row has three tags or fewer', () => {
    expect(splitTags(deriveTags(waRow({ awaitingReply: true }), ME)).hidden).toBe(0)
  })
})

describe('filters', () => {
  const rows: InboxRow[] = [
    waRow({ awaitingReply: true }),
    waRow({ senderRole: 'student', key: 'wa:2' }),
    waRow({ senderRole: 'teacher', key: 'wa:3' }),
    waRow({ senderRole: 'unknown', key: 'wa:4' }),
    waRow({ takenOver: true, key: 'wa:5' }),
    portalRow(),
  ]

  it('falls back to "all" for a missing or unknown value', () => {
    expect(parseInboxFilter(undefined)).toBe('all')
    expect(parseInboxFilter('nonsense')).toBe('all')
    expect(parseInboxFilter('awaiting')).toBe('awaiting')
  })

  it('narrows to what each chip claims', () => {
    const count = (f: Parameters<typeof matchesFilter>[1]) =>
      rows.filter((r) => matchesFilter(r, f)).length
    expect(count('all')).toBe(rows.length)
    expect(count('awaiting')).toBe(1)
    expect(count('taken_over')).toBe(1)
    expect(count('students')).toBe(1)
    expect(count('unknown')).toBe(1)
    expect(count('portal')).toBe(1)
    // Teachers and owners/admins share one chip: both are "the team".
    expect(count('staff')).toBe(1)
    // The portal row is a parent too.
    expect(count('parents')).toBe(3)
  })
})
