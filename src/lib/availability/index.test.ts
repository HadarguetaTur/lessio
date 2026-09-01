import { describe, it, expect } from 'vitest'
import { conflictingDays, hasOverlap, parseDayList, AvailabilityWindow } from './index'

function makeWindow(id: string, start: string, end: string): AvailabilityWindow {
  return { id, day_of_week: 0, start_time: start, end_time: end }
}

describe('hasOverlap', () => {
  const existing = [
    makeWindow('a', '09:00', '11:00'),
    makeWindow('b', '14:00', '16:00'),
  ]

  describe('no overlap cases', () => {
    it('returns false when new window is entirely before existing', () => {
      expect(hasOverlap('07:00', '09:00', existing)).toBe(false)
    })

    it('returns false when new window starts exactly when existing ends', () => {
      expect(hasOverlap('11:00', '12:00', existing)).toBe(false)
    })

    it('returns false when new window is entirely after all existing windows', () => {
      expect(hasOverlap('16:00', '18:00', existing)).toBe(false)
    })

    it('returns false when new window fits between two existing windows', () => {
      expect(hasOverlap('11:30', '13:30', existing)).toBe(false)
    })

    it('returns false for empty existing list', () => {
      expect(hasOverlap('09:00', '11:00', [])).toBe(false)
    })
  })

  describe('overlap cases', () => {
    it('returns true when new window is fully inside existing', () => {
      expect(hasOverlap('09:30', '10:30', existing)).toBe(true)
    })

    it('returns true when new window starts before and ends inside existing', () => {
      expect(hasOverlap('08:00', '10:00', existing)).toBe(true)
    })

    it('returns true when new window starts inside and ends after existing', () => {
      expect(hasOverlap('10:00', '12:00', existing)).toBe(true)
    })

    it('returns true when new window fully contains existing', () => {
      expect(hasOverlap('08:00', '12:00', existing)).toBe(true)
    })

    it('returns true when new window exactly matches existing', () => {
      expect(hasOverlap('09:00', '11:00', existing)).toBe(true)
    })
  })

  describe('excludeId', () => {
    it('ignores the excluded window so edit does not conflict with itself', () => {
      expect(hasOverlap('09:00', '11:00', existing, 'a')).toBe(false)
    })

    it('still detects overlap with other windows when excludeId is set', () => {
      expect(hasOverlap('14:30', '15:30', existing, 'a')).toBe(true)
    })
  })

  describe('Postgres HH:MM:SS format', () => {
    it('normalizes HH:MM:SS times correctly', () => {
      const withSeconds = [makeWindow('c', '09:00:00', '11:00:00')]
      expect(hasOverlap('10:00:00', '12:00:00', withSeconds)).toBe(true)
      expect(hasOverlap('11:00:00', '12:00:00', withSeconds)).toBe(false)
    })
  })
})

describe('parseDayList', () => {
  it('rejects an empty selection', () => {
    expect(parseDayList([])).toBeNull()
  })

  it('rejects a day outside 0..6', () => {
    expect(parseDayList(['7'])).toBeNull()
    expect(parseDayList(['-1'])).toBeNull()
  })

  it('rejects a non-numeric value', () => {
    expect(parseDayList(['mon'])).toBeNull()
  })

  it('dedupes and sorts', () => {
    expect(parseDayList(['2', '1', '1'])).toEqual([1, 2])
  })

  it('rejects the whole list when only one entry is bad', () => {
    // Silently dropping it would save a week the user did not ask for.
    expect(parseDayList(['1', '9'])).toBeNull()
  })
})

describe('conflictingDays', () => {
  const week = [
    { id: 'a', day_of_week: 1, start_time: '09:00', end_time: '11:00' },
    { id: 'b', day_of_week: 3, start_time: '14:00', end_time: '16:00' },
  ]

  it('returns nothing when the window is free on every selected day', () => {
    expect(conflictingDays([1, 2, 3], '12:00', '13:00', week)).toEqual([])
  })

  it('names only the days that actually clash', () => {
    expect(conflictingDays([1, 2, 3], '10:00', '15:00', week)).toEqual([1, 3])
  })

  it('treats a touching boundary as free', () => {
    expect(conflictingDays([1], '11:00', '12:00', week)).toEqual([])
  })

  it('does not let an edited window collide with itself', () => {
    expect(conflictingDays([1], '09:30', '11:30', week, 'a')).toEqual([])
  })
})
