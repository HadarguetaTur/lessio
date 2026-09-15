import { describe, expect, it } from 'vitest'
import { analyzeFreeSegment } from './scheduleImpact'

describe('analyzeFreeSegment', () => {
  it('warns when an off-cadence lesson creates two unusable fragments', () => {
    expect(analyzeFreeSegment({
      windowStart: '16:00', windowEnd: '20:00', proposedStart: '16:20',
      durationMinutes: 60, breakMinutes: 0, allowedDurations: [45, 60], busy: [],
    })).toEqual({
      fragments: [
        { start: '16:00', end: '16:20', minutes: 20 },
        { start: '17:20', end: '17:30', minutes: 10 },
      ],
      suggestions: ['16:30', '16:00', '16:45', '17:00'],
    })
  })

  it('stays silent when both remaining pieces can hold a lesson', () => {
    expect(analyzeFreeSegment({
      windowStart: '16:00', windowEnd: '20:00', proposedStart: '17:00',
      durationMinutes: 60, breakMinutes: 0, allowedDurations: [30, 60], busy: [],
    })).toBeNull()
  })

  it('packs suggestions beside existing lessons while preserving the break', () => {
    expect(analyzeFreeSegment({
      windowStart: '16:00', windowEnd: '20:00', proposedStart: '17:35',
      durationMinutes: 60, breakMinutes: 15, allowedDurations: [45, 60],
      busy: [{ start: 16 * 60, end: 17 * 60 }],
    })).toEqual({
      fragments: [
        // 35-minute gap after the 17:00 lesson: one 15-minute break, 20 stranded.
        { start: '17:15', end: '17:35', minutes: 20 },
        { start: '18:50', end: '19:00', minutes: 10 },
      ],
      suggestions: ['17:45', '17:15', '18:00', '18:15'],
    })
  })

  it('owes only one break when nothing fits between two lessons', () => {
    // Lesson ends 18:00, next starts 18:15, break 5: 10 minutes are stranded,
    // not 5 (the break is not reserved on both sides of an empty gap).
    const result = analyzeFreeSegment({
      windowStart: '17:00', windowEnd: '21:30', proposedStart: '17:00',
      durationMinutes: 60, breakMinutes: 5, allowedDurations: [45, 60],
      busy: [{ start: 18 * 60 + 15, end: 19 * 60 + 15 }],
    })
    expect(result?.fragments).toEqual([{ start: '18:00', end: '18:10', minutes: 10 }])
  })

  it('stays silent when the gap is exactly the break', () => {
    expect(analyzeFreeSegment({
      windowStart: '17:00', windowEnd: '21:30', proposedStart: '17:00',
      durationMinutes: 60, breakMinutes: 5, allowedDurations: [45, 60],
      busy: [{ start: 18 * 60 + 5, end: 21 * 60 + 30 }],
    })).toBeNull()
  })

  it('counts the whole gap at a window edge, where no break is owed', () => {
    const result = analyzeFreeSegment({
      windowStart: '16:00', windowEnd: '17:20', proposedStart: '16:20',
      durationMinutes: 60, breakMinutes: 5, allowedDurations: [45, 60], busy: [],
    })
    expect(result?.fragments).toEqual([{ start: '16:00', end: '16:20', minutes: 20 }])
  })

  it('warns when an arbitrary minute breaks the cadence even with room on both sides', () => {
    expect(analyzeFreeSegment({
      windowStart: '08:00', windowEnd: '20:00', proposedStart: '15:34',
      durationMinutes: 60, breakMinutes: 0, allowedDurations: [30, 45, 60, 90], busy: [],
    })).toEqual({
      fragments: [
        { start: '15:30', end: '15:34', minutes: 4 },
        { start: '16:34', end: '16:45', minutes: 11 },
      ],
      suggestions: ['15:30', '15:45', '15:15', '16:00'],
    })
  })
})
