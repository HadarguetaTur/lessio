import { describe, it, expect } from 'vitest'
import {
  isValidStatusTransition,
  localMidnightToUTC,
  getCurrentWeekSunday,
  getWeekDays,
  mapLesson,
  LessonStatus,
} from './index'

describe('mapLesson', () => {
  const base = {
    id: 'l1',
    start_at: '2026-09-02T10:00:00Z',
    end_at: '2026-09-02T11:00:00Z',
    status: 'scheduled',
    cancel_reason: null,
    series_id: null,
    teachers: { id: 't1', profiles: { full_name: 'מורה' } },
  }

  it('keeps every enrolled student, skipping orphaned enrolments', () => {
    const lesson = mapLesson({
      ...base,
      lesson_type: 'group',
      lesson_students: [
        { student_id: 's1', students: { id: 's1', full_name: 'א' } },
        { student_id: 's-gone', students: null },
        { student_id: 's2', students: { id: 's2', full_name: 'ב' } },
      ],
      student_groups: { id: 'g1', name: 'קבוצה א' },
    })
    expect(lesson.students).toEqual([
      { id: 's1', full_name: 'א' },
      { id: 's2', full_name: 'ב' },
    ])
    expect(lesson.group).toEqual({ id: 'g1', name: 'קבוצה א' })
  })

  it('reads a null group for lessons without a link', () => {
    const lesson = mapLesson({
      ...base,
      lesson_type: 'individual',
      lesson_students: [{ student_id: 's1', students: { id: 's1', full_name: 'א' } }],
      student_groups: null,
    })
    expect(lesson.group).toBeNull()
    expect(lesson.students).toHaveLength(1)
  })

  it('tolerates the embed arriving as an array', () => {
    const lesson = mapLesson({
      ...base,
      lesson_type: 'group',
      lesson_students: [],
      student_groups: [{ id: 'g1', name: 'קבוצה א' }],
    })
    expect(lesson.group?.name).toBe('קבוצה א')
  })
})

describe('isValidStatusTransition', () => {
  it('allows any transition from scheduled', () => {
    expect(isValidStatusTransition('scheduled', 'completed')).toBe(true)
    expect(isValidStatusTransition('scheduled', 'no_show')).toBe(true)
    expect(isValidStatusTransition('scheduled', 'cancelled')).toBe(true)
  })

  it('allows any transition from completed', () => {
    expect(isValidStatusTransition('completed', 'scheduled')).toBe(true)
    expect(isValidStatusTransition('completed', 'no_show')).toBe(true)
    expect(isValidStatusTransition('completed', 'cancelled')).toBe(true)
  })

  it('allows any transition from no_show', () => {
    expect(isValidStatusTransition('no_show', 'scheduled')).toBe(true)
    expect(isValidStatusTransition('no_show', 'completed')).toBe(true)
    expect(isValidStatusTransition('no_show', 'cancelled')).toBe(true)
  })

  it('blocks all transitions from cancelled (terminal state)', () => {
    const targets: LessonStatus[] = ['scheduled', 'completed', 'no_show', 'cancelled']
    for (const next of targets) {
      expect(isValidStatusTransition('cancelled', next)).toBe(false)
    }
  })
})

describe('localMidnightToUTC', () => {
  it('returns a Date for UTC+2 (Israel summer time GMT+3 → GMT+2)', () => {
    // For Asia/Jerusalem in winter (UTC+2), midnight 2024-01-15 local = 22:00 UTC on 2024-01-14
    const result = localMidnightToUTC('2024-01-15', 'Asia/Jerusalem')
    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toMatch(/^2024-01-14T22:00:00/)
  })

  it('returns a Date for UTC+0 timezone', () => {
    const result = localMidnightToUTC('2024-06-01', 'UTC')
    expect(result.toISOString()).toBe('2024-06-01T00:00:00.000Z')
  })
})

describe('getWeekDays', () => {
  it('returns 7 consecutive dates starting from the given Sunday', () => {
    const days = getWeekDays('2024-01-07', 'UTC') // Sunday 2024-01-07
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2024-01-07')
    expect(days[1]).toBe('2024-01-08')
    expect(days[6]).toBe('2024-01-13')
  })
})

describe('getCurrentWeekSunday', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = getCurrentWeekSunday('Asia/Jerusalem')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns a Sunday (day 0 in en-US locale)', () => {
    const result = getCurrentWeekSunday('Asia/Jerusalem')
    const date = new Date(`${result}T12:00:00Z`)
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date)
    expect(dayName).toBe('Sun')
  })
})
