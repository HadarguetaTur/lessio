import { describe, it, expect } from 'vitest'
import { subtractRanges, normalizeTime } from './constants'

const r = (start: string, end: string) => ({ start, end })

describe('normalizeTime', () => {
  it('trims Postgres seconds', () => {
    expect(normalizeTime('16:00:00')).toBe('16:00')
  })

  it('leaves an already-short time alone', () => {
    expect(normalizeTime('16:00')).toBe('16:00')
  })
})

describe('subtractRanges', () => {
  it('returns the base untouched when nothing is blocked', () => {
    expect(subtractRanges([r('08:00', '20:00')], [])).toEqual([r('08:00', '20:00')])
  })

  it('trims the front when the morning is blocked', () => {
    expect(subtractRanges([r('08:00', '20:00')], [r('08:00', '12:00')])).toEqual([
      r('12:00', '20:00'),
    ])
  })

  it('trims the back when the evening is blocked', () => {
    expect(subtractRanges([r('08:00', '20:00')], [r('17:00', '20:00')])).toEqual([
      r('08:00', '17:00'),
    ])
  })

  it('splits a window in two when the block lands in the middle', () => {
    expect(subtractRanges([r('08:00', '20:00')], [r('12:00', '14:00')])).toEqual([
      r('08:00', '12:00'),
      r('14:00', '20:00'),
    ])
  })

  it('applies several blocks to the same window', () => {
    expect(
      subtractRanges([r('08:00', '20:00')], [r('08:00', '12:00'), r('17:00', '19:00')])
    ).toEqual([r('12:00', '17:00'), r('19:00', '20:00')])
  })

  it('swallows a window the block fully covers', () => {
    expect(subtractRanges([r('09:00', '11:00')], [r('08:00', '12:00')])).toEqual([])
  })

  it('ignores a block that falls outside every window', () => {
    expect(subtractRanges([r('08:00', '12:00')], [r('14:00', '16:00')])).toEqual([
      r('08:00', '12:00'),
    ])
  })

  it('treats a touching boundary as no overlap', () => {
    // A block starting exactly when the window ends removes nothing — the same
    // half-open convention hasOverlap uses.
    expect(subtractRanges([r('08:00', '12:00')], [r('12:00', '14:00')])).toEqual([
      r('08:00', '12:00'),
    ])
    expect(subtractRanges([r('12:00', '16:00')], [r('08:00', '12:00')])).toEqual([
      r('12:00', '16:00'),
    ])
  })

  it('cuts across several base windows at once', () => {
    expect(
      subtractRanges([r('08:00', '12:00'), r('16:00', '20:00')], [r('11:00', '17:00')])
    ).toEqual([r('08:00', '11:00'), r('17:00', '20:00')])
  })

  it('normalizes Postgres HH:MM:SS on both sides', () => {
    expect(subtractRanges([r('08:00:00', '20:00:00')], [r('12:00:00', '14:00:00')])).toEqual([
      r('08:00', '12:00'),
      r('14:00', '20:00'),
    ])
  })

  it('drops a degenerate base window and ignores a degenerate block', () => {
    expect(subtractRanges([r('10:00', '10:00')], [])).toEqual([])
    expect(subtractRanges([r('08:00', '20:00')], [r('12:00', '12:00')])).toEqual([
      r('08:00', '20:00'),
    ])
  })

  it('returns the result sorted by start', () => {
    expect(
      subtractRanges([r('16:00', '20:00'), r('08:00', '12:00')], [r('17:00', '18:00')])
    ).toEqual([r('08:00', '12:00'), r('16:00', '17:00'), r('18:00', '20:00')])
  })
})
