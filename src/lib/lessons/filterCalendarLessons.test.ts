import { describe, it, expect } from 'vitest'
import { filterCalendarLessons } from './filterCalendarLessons'
import type { Lesson, LessonStatus } from './types'

const NOW = new Date('2026-08-15T12:00:00.000Z')

function lesson(id: string, status: LessonStatus, start_at: string): Lesson {
  return {
    id,
    start_at,
    end_at: new Date(new Date(start_at).getTime() + 60 * 60 * 1000).toISOString(),
    status,
    lesson_type: 'individual',
    cancel_reason: status === 'cancelled' ? 'SERIES_CANCELLED' : null,
    series_id: null,
    teacher: { id: 't1', full_name: 'Teacher' },
    students: [{ id: 's1', full_name: 'Student' }],
    group: null,
  }
}

const ids = (ls: Lesson[]) => ls.map((l) => l.id)

describe('filterCalendarLessons', () => {
  it('hides cancelled lessons that have not happened yet', () => {
    const lessons = [
      lesson('future-cancelled', 'cancelled', '2026-08-15T16:00:00.000Z'),
      lesson('future-scheduled', 'scheduled', '2026-08-15T17:00:00.000Z'),
    ]
    const { visible, hiddenCount } = filterCalendarLessons(lessons, {
      includeCancelled: false,
      now: NOW,
    })
    expect(ids(visible)).toEqual(['future-scheduled'])
    expect(hiddenCount).toBe(1)
  })

  it('keeps cancelled lessons in the past — they happened and may carry a charge', () => {
    const lessons = [lesson('past-cancelled', 'cancelled', '2026-08-15T09:00:00.000Z')]
    const { visible, hiddenCount } = filterCalendarLessons(lessons, {
      includeCancelled: false,
      now: NOW,
    })
    expect(ids(visible)).toEqual(['past-cancelled'])
    expect(hiddenCount).toBe(0)
  })

  it('never hides scheduled, completed or no_show lessons', () => {
    const lessons = [
      lesson('scheduled', 'scheduled', '2026-08-15T16:00:00.000Z'),
      lesson('completed', 'completed', '2026-08-15T09:00:00.000Z'),
      lesson('no-show-past', 'no_show', '2026-08-15T10:00:00.000Z'),
      lesson('no-show-future', 'no_show', '2026-08-15T18:00:00.000Z'),
      lesson('stale-scheduled', 'scheduled', '2026-08-15T08:00:00.000Z'),
    ]
    const { visible, hiddenCount } = filterCalendarLessons(lessons, {
      includeCancelled: false,
      now: NOW,
    })
    expect(visible).toHaveLength(5)
    expect(hiddenCount).toBe(0)
  })

  it('hides a cancelled lesson starting exactly now — it has not started', () => {
    const lessons = [lesson('now', 'cancelled', NOW.toISOString())]
    const { visible, hiddenCount } = filterCalendarLessons(lessons, {
      includeCancelled: false,
      now: NOW,
    })
    expect(visible).toEqual([])
    expect(hiddenCount).toBe(1)
  })

  it('returns everything when the toggle is on, but still reports the count', () => {
    const lessons = [
      lesson('future-cancelled', 'cancelled', '2026-08-15T16:00:00.000Z'),
      lesson('past-cancelled', 'cancelled', '2026-08-15T09:00:00.000Z'),
      lesson('scheduled', 'scheduled', '2026-08-15T17:00:00.000Z'),
    ]
    const { visible, hiddenCount } = filterCalendarLessons(lessons, {
      includeCancelled: true,
      now: NOW,
    })
    expect(ids(visible)).toEqual(['future-cancelled', 'past-cancelled', 'scheduled'])
    expect(hiddenCount).toBe(1)
  })

  it('handles an empty calendar', () => {
    expect(filterCalendarLessons([], { includeCancelled: false, now: NOW })).toEqual({
      visible: [],
      hiddenCount: 0,
    })
  })

  it('preserves the incoming order of the visible lessons', () => {
    const lessons = [
      lesson('a', 'scheduled', '2026-08-15T14:00:00.000Z'),
      lesson('drop', 'cancelled', '2026-08-15T15:00:00.000Z'),
      lesson('b', 'scheduled', '2026-08-15T16:00:00.000Z'),
    ]
    const { visible } = filterCalendarLessons(lessons, { includeCancelled: false, now: NOW })
    expect(ids(visible)).toEqual(['a', 'b'])
  })
})
