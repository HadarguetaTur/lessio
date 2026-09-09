import { describe, it, expect, vi, afterEach } from 'vitest'
import { DateTime, Settings } from 'luxon'
import { parseExamDate, parseExamDateTime } from './parseExamDate'

const TZ = 'Asia/Jerusalem'

function freezeAt(iso: string) {
  const millis = DateTime.fromISO(iso, { zone: 'utc' }).toMillis()
  Settings.now = () => millis
}

afterEach(() => {
  Settings.now = () => Date.now()
  vi.restoreAllMocks()
})

describe('parseExamDate', () => {
  it('parses day/month in the current year', () => {
    freezeAt('2026-08-29T10:00:00Z')
    expect(parseExamDate('15/09', TZ)).toBe('2026-09-15')
    expect(parseExamDate('15.9', TZ)).toBe('2026-09-15')
  })

  it('rolls a passed day/month into next year', () => {
    freezeAt('2026-08-29T10:00:00Z')
    expect(parseExamDate('01/02', TZ)).toBe('2027-02-01')
  })

  it('honours an explicit year even in the past', () => {
    freezeAt('2026-08-29T10:00:00Z')
    expect(parseExamDate('15/09/2025', TZ)).toBe('2025-09-15')
    expect(parseExamDate('15/09/27', TZ)).toBe('2027-09-15')
  })

  it('accepts full ISO dates', () => {
    expect(parseExamDate('2026-12-01', TZ)).toBe('2026-12-01')
  })

  it('rejects nonsense', () => {
    expect(parseExamDate('מחר', TZ)).toBeNull()
    expect(parseExamDate('32/13', TZ)).toBeNull()
    expect(parseExamDate('', TZ)).toBeNull()
  })
})

describe('parseExamDateTime', () => {
  it('reads a date with no time', () => {
    freezeAt('2026-08-29T10:00:00Z')
    expect(parseExamDateTime('15/09', TZ)).toEqual({ date: '2026-09-15', time: null })
  })

  it('reads a time typed after the date', () => {
    freezeAt('2026-08-29T10:00:00Z')
    expect(parseExamDateTime('15/09 10:00', TZ)).toEqual({ date: '2026-09-15', time: '10:00' })
    expect(parseExamDateTime('15.9 8:30', TZ)).toEqual({ date: '2026-09-15', time: '08:30' })
  })

  it('accepts a bare hour and the Hebrew/English lead-ins', () => {
    freezeAt('2026-08-29T10:00:00Z')
    expect(parseExamDateTime('15/09 9', TZ)).toEqual({ date: '2026-09-15', time: '09:00' })
    expect(parseExamDateTime('15/09 בשעה 14:00', TZ)).toEqual({ date: '2026-09-15', time: '14:00' })
    expect(parseExamDateTime('15/09, 14:00', TZ)).toEqual({ date: '2026-09-15', time: '14:00' })
  })

  it('does not mistake part of a date for a time', () => {
    freezeAt('2026-08-29T10:00:00Z')
    expect(parseExamDateTime('2026-12-01', TZ)).toEqual({ date: '2026-12-01', time: null })
    expect(parseExamDateTime('15/09/2027', TZ)).toEqual({ date: '2027-09-15', time: null })
  })

  it('rejects a time with no date in front of it', () => {
    expect(parseExamDateTime('10:00', TZ)).toBeNull()
  })

  it('rejects nonsense, time or no time', () => {
    expect(parseExamDateTime('מחר 10:00', TZ)).toBeNull()
    expect(parseExamDateTime('', TZ)).toBeNull()
  })
})
