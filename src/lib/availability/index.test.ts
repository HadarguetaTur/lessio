import { describe, it, expect } from 'vitest'
import { hasOverlap, AvailabilityWindow } from './index'

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
