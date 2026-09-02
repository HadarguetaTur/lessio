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
        { start: '17:15', end: '17:20', minutes: 5 },
        { start: '18:50', end: '19:00', minutes: 10 },
      ],
      suggestions: ['17:45', '17:15', '18:00', '18:15'],
    })
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
