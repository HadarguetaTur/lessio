import { describe, it, expect } from 'vitest'
import {
  TEACHER_COLOR_KEYS,
  TEACHER_COLOR_CLASSES,
  deriveTeacherColor,
  isTeacherColorKey,
  resolveTeacherColor,
} from './color'

describe('resolveTeacherColor', () => {
  const id = 'a1000000-0000-4000-8000-000000000001'

  it('uses the stored colour when it is a palette key', () => {
    expect(resolveTeacherColor({ id, color: 'rose' })).toBe('rose')
  })

  it('derives a colour when nothing is stored', () => {
    expect(resolveTeacherColor({ id, color: null })).toBe(deriveTeacherColor(id))
    expect(resolveTeacherColor({ id })).toBe(deriveTeacherColor(id))
  })

  it('ignores a stored value outside the palette', () => {
    expect(resolveTeacherColor({ id, color: '#ff0000' })).toBe(deriveTeacherColor(id))
  })
})

describe('deriveTeacherColor', () => {
  it('is stable for the same id', () => {
    const id = 'd3000001-0000-4000-8000-00000000000a'
    expect(deriveTeacherColor(id)).toBe(deriveTeacherColor(id))
  })

  it('always returns a palette key', () => {
    for (let i = 0; i < 50; i++) {
      const key = deriveTeacherColor(`d3000001-0000-4000-8000-${String(i).padStart(12, '0')}`)
      expect(isTeacherColorKey(key)).toBe(true)
    }
  })

  it('spreads ids that share a prefix across the palette', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      seen.add(deriveTeacherColor(`d3000001-0000-4000-8000-${String(i).padStart(12, '0')}`))
    }
    // A first-character hash would put all of these in one bucket.
    expect(seen.size).toBeGreaterThan(4)
  })
})

describe('palette', () => {
  it('has classes for every key', () => {
    for (const key of TEACHER_COLOR_KEYS) {
      const c = TEACHER_COLOR_CLASSES[key]
      expect(c.stripe).toMatch(/^border-s-/)
      expect(c.dot).toMatch(/^bg-/)
      expect(c.chipActive).toContain('text-')
    }
  })

  it('isTeacherColorKey rejects non-keys', () => {
    expect(isTeacherColorKey('')).toBe(false)
    expect(isTeacherColorKey(null)).toBe(false)
    expect(isTeacherColorKey('red')).toBe(false)
    expect(isTeacherColorKey('blue')).toBe(true)
  })
})
