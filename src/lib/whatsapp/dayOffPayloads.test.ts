import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateTime, Settings } from 'luxon'

import {
  MAX_DAY_OFF_DAYS,
  datesInRange,
  decodeDayOffPayload,
  decodeStaffRequestPayload,
  encodeDayOffPayload,
  encodeStaffRequestPayload,
  formatDateRange,
} from './dayOffPayloads'

const TZ = 'Asia/Jerusalem'
// A fixed "now" so "today" and "tomorrow" mean something stable in assertions.
const NOW = DateTime.fromISO('2026-08-17T09:00:00', { zone: TZ })
const TODAY = '2026-08-17'
const TOMORROW = '2026-08-18'

beforeEach(() => {
  Settings.now = () => NOW.toMillis()
})

afterEach(() => {
  Settings.now = () => Date.now()
  vi.restoreAllMocks()
})

describe('day-off payload round-trips', () => {
  it('survives every step of the picker', () => {
    const steps = [
      { step: 'pick', offset: 0 },
      { step: 'pick', offset: 8 },
      { step: 'start', startDate: TOMORROW },
      { step: 'endpick', startDate: TOMORROW, offset: 8 },
      { step: 'end', startDate: TOMORROW, endDate: '2026-08-20' },
      { step: 'confirm', startDate: TOMORROW, endDate: '2026-08-20' },
      { step: 'abort' },
    ] as const

    for (const step of steps) {
      expect(decodeDayOffPayload(encodeDayOffPayload(step), TZ), step.step).toEqual(step)
    }
  })

  it('stays well inside Meta’s reply-id length limit', () => {
    const longest = encodeDayOffPayload({
      step: 'confirm',
      startDate: '2026-12-31',
      endDate: '2027-01-13',
    })
    expect(longest.length).toBeLessThan(60)
  })
})

describe('decodeDayOffPayload', () => {
  it('ignores payloads that belong to another namespace', () => {
    // Falling through matters: the menu's own ids reach the same handler.
    expect(decodeDayOffPayload(undefined, TZ)).toBeNull()
    expect(decodeDayOffPayload('', TZ)).toBeNull()
    expect(decodeDayOffPayload('m:book', TZ)).toBeNull()
    expect(decodeDayOffPayload('r:teacher', TZ)).toBeNull()
    expect(decodeDayOffPayload('a:approve:x', TZ)).toBeNull()
    expect(decodeDayOffPayload('d', TZ)).toBeNull()
    expect(decodeDayOffPayload('d:launch_missiles:1', TZ)).toBeNull()
  })

  it('accepts today, and rejects a date that has already passed', () => {
    // A list sent last week is still tappable; its dates are not.
    expect(decodeDayOffPayload(`d:start:${TODAY}`, TZ)).toEqual({
      step: 'start',
      startDate: TODAY,
    })
    expect(decodeDayOffPayload('d:start:2026-08-16', TZ)).toBeNull()
    expect(decodeDayOffPayload('d:start:2020-01-01', TZ)).toBeNull()
  })

  it('rejects a malformed date rather than guessing', () => {
    for (const bad of ['d:start:not-a-date', 'd:start:2026-13-45', 'd:start:17/08/2026', 'd:start:']) {
      expect(decodeDayOffPayload(bad, TZ), bad).toBeNull()
    }
  })

  it('rejects a range that ends before it starts', () => {
    expect(decodeDayOffPayload('d:confirm:2026-08-20:2026-08-18', TZ)).toBeNull()
  })

  it('rejects a range longer than the cap', () => {
    const start = DateTime.fromISO(TOMORROW, { zone: TZ })
    const lastAllowed = start.plus({ days: MAX_DAY_OFF_DAYS - 1 }).toFormat('yyyy-MM-dd')
    const oneTooMany = start.plus({ days: MAX_DAY_OFF_DAYS }).toFormat('yyyy-MM-dd')

    expect(decodeDayOffPayload(`d:confirm:${TOMORROW}:${lastAllowed}`, TZ)).not.toBeNull()
    expect(decodeDayOffPayload(`d:confirm:${TOMORROW}:${oneTooMany}`, TZ)).toBeNull()
  })

  it('rejects an offset that is not a small positive number', () => {
    for (const bad of ['d:pick:-1', 'd:pick:9999', 'd:pick:abc', 'd:pick:1.5', 'd:pick:']) {
      expect(decodeDayOffPayload(bad, TZ), bad).toBeNull()
    }
    expect(decodeDayOffPayload('d:pick:0', TZ)).toEqual({ step: 'pick', offset: 0 })
  })

  it('rejects the right arity for each step', () => {
    expect(decodeDayOffPayload('d:abort:extra', TZ)).toBeNull()
    expect(decodeDayOffPayload(`d:end:${TOMORROW}`, TZ)).toBeNull()
    expect(decodeDayOffPayload(`d:endpick:${TOMORROW}`, TZ)).toBeNull()
  })
})

describe('decodeStaffRequestPayload', () => {
  const ID = '0142401d-89d0-47ad-bd3f-20edfb4ca444'

  it('round-trips each action', () => {
    for (const action of ['show', 'approve', 'reject'] as const) {
      expect(decodeStaffRequestPayload(encodeStaffRequestPayload(action, ID))).toEqual({
        action,
        requestId: ID,
      })
    }
  })

  it('ignores foreign namespaces and unknown actions', () => {
    expect(decodeStaffRequestPayload(undefined)).toBeNull()
    expect(decodeStaffRequestPayload('m:book')).toBeNull()
    expect(decodeStaffRequestPayload(`d:start:${TOMORROW}`)).toBeNull()
    expect(decodeStaffRequestPayload(`a:delete:${ID}`)).toBeNull()
    expect(decodeStaffRequestPayload('a:approve')).toBeNull()
    expect(decodeStaffRequestPayload(`a:approve:${ID}:extra`)).toBeNull()
  })

  it('rejects an id that is not shaped like a uuid', () => {
    // Only a shape check — that the request exists and belongs to the sender's
    // org is re-checked against the database before anything is decided.
    expect(decodeStaffRequestPayload('a:approve:not-a-uuid')).toBeNull()
    expect(decodeStaffRequestPayload("a:approve:'; drop table--")).toBeNull()
  })
})

describe('datesInRange', () => {
  it('includes both endpoints', () => {
    expect(datesInRange('2026-08-18', '2026-08-20', TZ)).toEqual([
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
    ])
  })

  it('returns the single day when start and end match', () => {
    expect(datesInRange('2026-08-18', '2026-08-18', TZ)).toEqual(['2026-08-18'])
  })

  it('crosses a month boundary without dropping a day', () => {
    expect(datesInRange('2026-08-30', '2026-09-01', TZ)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
    ])
  })

  it('returns nothing for a backwards or unparseable range', () => {
    expect(datesInRange('2026-08-20', '2026-08-18', TZ)).toEqual([])
    expect(datesInRange('nonsense', '2026-08-18', TZ)).toEqual([])
  })
})

describe('formatDateRange', () => {
  it('shows one date for a single day and both for a range', () => {
    expect(formatDateRange('2026-08-18', '2026-08-18', TZ)).toBe('18/08')
    expect(formatDateRange('2026-08-18', '2026-08-20', TZ)).toBe('18/08–20/08')
  })
})
