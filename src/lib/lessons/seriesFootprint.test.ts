import { describe, expect, it } from 'vitest'
import { hasFootprint } from './seriesFootprint'

const NO_CHARGES = new Set<string>()
const NO_NOTES = new Set<string>()

const occurrence = (over: Partial<{ id: string; status: string; cancel_reason: string | null }> = {}) => ({
  id: 'lesson-1',
  status: 'scheduled',
  cancel_reason: null,
  ...over,
})

describe('series occurrence footprint', () => {
  it('treats a plain planned lesson as free of history', () => {
    expect(hasFootprint(occurrence(), NO_CHARGES, NO_NOTES)).toBe(false)
  })

  it('treats a row the old series-cancel path wrote as planning noise', () => {
    const lesson = occurrence({ status: 'cancelled', cancel_reason: 'SERIES_CANCELLED' })
    expect(hasFootprint(lesson, NO_CHARGES, NO_NOTES)).toBe(false)
  })

  it('protects lessons that actually happened', () => {
    expect(hasFootprint(occurrence({ status: 'completed' }), NO_CHARGES, NO_NOTES)).toBe(true)
    expect(hasFootprint(occurrence({ status: 'no_show' }), NO_CHARGES, NO_NOTES)).toBe(true)
  })

  it('protects a cancellation someone made by hand', () => {
    const lesson = occurrence({ status: 'cancelled', cancel_reason: 'Parent asked' })
    expect(hasFootprint(lesson, NO_CHARGES, NO_NOTES)).toBe(true)
  })

  it('protects a planned lesson that already carries a charge', () => {
    // charges.lesson_id has no ON DELETE — deleting this row would abort the
    // whole batch, so it must be classified out before the delete is built.
    expect(hasFootprint(occurrence(), new Set(['lesson-1']), NO_NOTES)).toBe(true)
  })

  it('protects a planned lesson a teacher has written about', () => {
    // lesson_notes cascades, so this one would vanish silently instead.
    expect(hasFootprint(occurrence(), NO_CHARGES, new Set(['lesson-1']))).toBe(true)
  })

  it('does not confuse one lesson\u2019s charge with another\u2019s', () => {
    expect(hasFootprint(occurrence({ id: 'lesson-2' }), new Set(['lesson-1']), NO_NOTES)).toBe(false)
  })
})
