import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import { isInSendWindow, nextSendWindowStart, pickMailbox, remainingCapacity, startOfLocalDay, type MailboxWithUsage } from './mailboxes'

const box = (over: Partial<MailboxWithUsage>): MailboxWithUsage => ({
  id: over.id ?? 'a',
  email: over.email ?? `${over.id ?? 'a'}@example.com`,
  display_name: null,
  is_active: true,
  daily_cap: 30,
  last_history_id: null,
  last_polled_at: null,
  last_error: null,
  last_error_at: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  sentToday: 0,
  ...over,
})

const at = (iso: string) => DateTime.fromISO(iso, { zone: 'Asia/Jerusalem' }).toJSDate()

describe('isInSendWindow', () => {
  it('sends on a Sunday morning, not on a Friday or at night', () => {
    expect(isInSendWindow(at('2026-09-06T09:00'))).toBe(true) // Sunday
    expect(isInSendWindow(at('2026-09-10T17:59'))).toBe(true) // Thursday
    expect(isInSendWindow(at('2026-09-10T18:00'))).toBe(false)
    expect(isInSendWindow(at('2026-09-11T10:00'))).toBe(false) // Friday
    expect(isInSendWindow(at('2026-09-12T10:00'))).toBe(false) // Saturday
    expect(isInSendWindow(at('2026-09-07T07:59'))).toBe(false)
  })

  it('judges by Israel time, not UTC', () => {
    // 05:30 UTC in September = 08:30 IDT.
    expect(isInSendWindow(new Date('2026-09-07T05:30:00Z'))).toBe(true)
    expect(isInSendWindow(new Date('2026-09-07T04:30:00Z'))).toBe(false)
  })
})

describe('startOfLocalDay', () => {
  it('resets the cap at Israel midnight', () => {
    expect(startOfLocalDay(new Date('2026-09-07T05:30:00Z'))).toBe('2026-09-06T21:00:00.000Z')
  })
})

describe('pickMailbox', () => {
  it('prefers the box with the most room today', () => {
    const picked = pickMailbox([
      box({ id: 'a', sentToday: 20 }),
      box({ id: 'b', sentToday: 5 }),
      box({ id: 'c', sentToday: 12 }),
    ])
    expect(picked?.id).toBe('b')
  })

  it('skips inactive and capped boxes', () => {
    expect(
      pickMailbox([box({ id: 'a', is_active: false }), box({ id: 'b', sentToday: 30 }), box({ id: 'c', daily_cap: 0 })])
    ).toBeNull()
  })

  it('lets a freshly failing box wait its turn on a tie', () => {
    const picked = pickMailbox([
      box({ id: 'a', last_error_at: '2026-09-07T08:00:00Z' }),
      box({ id: 'b', last_error_at: null }),
    ])
    expect(picked?.id).toBe('b')
  })
})

describe('remainingCapacity', () => {
  it('sums headroom over active boxes only', () => {
    expect(
      remainingCapacity([box({ id: 'a', sentToday: 10 }), box({ id: 'b', is_active: false }), box({ id: 'c', sentToday: 31 })])
    ).toBe(20)
  })
})

describe('nextSendWindowStart', () => {
  const at = (iso: string) => DateTime.fromISO(iso, { zone: 'Asia/Jerusalem' }).toJSDate()
  const local = (d: Date | null) =>
    d ? DateTime.fromJSDate(d).setZone('Asia/Jerusalem').toFormat('ccc HH:mm') : null

  it('is null while sending is on', () => {
    expect(nextSendWindowStart(at('2026-09-09T10:00'))).toBeNull() // Wednesday morning
  })

  it('a Thursday evening waits for Sunday', () => {
    expect(local(nextSendWindowStart(at('2026-09-10T19:00')))).toBe('Sun 08:00')
  })

  it('a Sunday before the window waits for the same morning', () => {
    expect(local(nextSendWindowStart(at('2026-09-13T07:00')))).toBe('Sun 08:00')
  })

  it('a Wednesday after the window waits for Thursday', () => {
    expect(local(nextSendWindowStart(at('2026-09-09T18:30')))).toBe('Thu 08:00')
  })

  it('Saturday waits for Sunday', () => {
    expect(local(nextSendWindowStart(at('2026-09-12T12:00')))).toBe('Sun 08:00')
  })
})
