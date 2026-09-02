import { describe, expect, it } from 'vitest'
import { analyzeFreeSegment } from './scheduleImpact'

describe('analyzeFreeSegment', () => {
  it('warns when an off-cadence lesson creates two unusable fragments', () => {
    expect(analyzeFreeSegment({
      windowStart: '16:00', windowEnd: '20:00', proposedStart: '16:20',
      durationMinutes: 60, breakMinutes: 0, shortestDuration: 45, busy: [],
    })).toEqual({
      fragments: [{ start: '16:00', end: '16:20', minutes: 20 }],
      suggestions: ['16:00', '19:00'],
    })
  })

  it('stays silent when both remaining pieces can hold a lesson', () => {
    expect(analyzeFreeSegment({
      windowStart: '16:00', windowEnd: '20:00', proposedStart: '17:00',
      durationMinutes: 60, breakMinutes: 0, shortestDuration: 30, busy: [],
    })).toBeNull()
  })

  it('packs suggestions beside existing lessons while preserving the break', () => {
    expect(analyzeFreeSegment({
      windowStart: '16:00', windowEnd: '20:00', proposedStart: '17:35',
      durationMinutes: 60, breakMinutes: 15, shortestDuration: 45,
      busy: [{ start: 16 * 60, end: 17 * 60 }],
    })).toEqual({
      fragments: [{ start: '17:15', end: '17:20', minutes: 5 }],
      suggestions: ['17:15', '19:00'],
    })
  })
})
