import { describe, it, expect } from 'vitest'
import { hasMultiplePrimary } from './index'

describe('hasMultiplePrimary', () => {
  it('returns false when no parents are primary', () => {
    expect(
      hasMultiplePrimary([{ is_primary: false }, { is_primary: false }])
    ).toBe(false)
  })

  it('returns false when exactly one parent is primary', () => {
    expect(
      hasMultiplePrimary([{ is_primary: true }, { is_primary: false }, { is_primary: false }])
    ).toBe(false)
  })

  it('returns true when two parents are primary (violated constraint)', () => {
    expect(
      hasMultiplePrimary([{ is_primary: true }, { is_primary: true }])
    ).toBe(true)
  })

  it('returns true when all parents are marked primary', () => {
    expect(
      hasMultiplePrimary([{ is_primary: true }, { is_primary: true }, { is_primary: true }])
    ).toBe(true)
  })

  it('returns false for empty list', () => {
    expect(hasMultiplePrimary([])).toBe(false)
  })

  it('returns false for single primary parent', () => {
    expect(hasMultiplePrimary([{ is_primary: true }])).toBe(false)
  })
})
