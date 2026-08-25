import { describe, it, expect } from 'vitest'
import { findNextLessonId } from './nextLesson'

const NOW = '2026-08-15T12:00:00.000Z'

function lesson(id: string, status: string, start_at: string) {
  return { id, status, start_at }
}

describe('findNextLessonId', () => {
  it('returns the first future scheduled lesson', () => {
    const lessons = [
      lesson('past', 'completed', '2026-08-15T09:00:00.000Z'),
      lesson('next', 'scheduled', '2026-08-15T14:00:00.000Z'),
      lesson('later', 'scheduled', '2026-08-15T16:00:00.000Z'),
    ]
    expect(findNextLessonId(lessons, NOW)).toBe('next')
  })

  it('skips past lessons even if still marked scheduled', () => {
    const lessons = [
      lesson('stale', 'scheduled', '2026-08-15T09:00:00.000Z'),
      lesson('next', 'scheduled', '2026-08-15T14:00:00.000Z'),
    ]
    expect(findNextLessonId(lessons, NOW)).toBe('next')
  })

  it('skips cancelled and no_show future lessons', () => {
    const lessons = [
      lesson('cancelled', 'cancelled', '2026-08-15T14:00:00.000Z'),
      lesson('no-show', 'no_show', '2026-08-15T15:00:00.000Z'),
      lesson('next', 'scheduled', '2026-08-15T16:00:00.000Z'),
    ]
    expect(findNextLessonId(lessons, NOW)).toBe('next')
  })

  it('counts a lesson starting exactly now as next', () => {
    expect(findNextLessonId([lesson('now', 'scheduled', NOW)], NOW)).toBe('now')
  })

  it('returns null when the day is over', () => {
    const lessons = [
      lesson('a', 'completed', '2026-08-15T09:00:00.000Z'),
      lesson('b', 'no_show', '2026-08-15T10:00:00.000Z'),
    ]
    expect(findNextLessonId(lessons, NOW)).toBeNull()
  })

  it('returns null for an empty day', () => {
    expect(findNextLessonId([], NOW)).toBeNull()
  })
})
