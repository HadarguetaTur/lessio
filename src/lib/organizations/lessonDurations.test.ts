import { describe, expect, it } from 'vitest'
import { DEFAULT_LESSON_DURATIONS, normalizeLessonDurations } from './lessonDurations'

describe('normalizeLessonDurations', () => {
  it('keeps valid settings, removes duplicates, and sorts by minutes', () => {
    expect(normalizeLessonDurations([
      { minutes: 75, bot: true, teacher: false, admin: true },
      { minutes: 20, bot: false, teacher: true, admin: false },
      { minutes: 75, bot: false, teacher: true, admin: true },
      { minutes: 2, bot: true, teacher: true, admin: true },
    ])).toEqual([
      { minutes: 20, bot: false, teacher: true, admin: false },
      { minutes: 75, bot: false, teacher: true, admin: true },
    ])
  })

  it('uses the backward-compatible defaults for a missing setting', () => {
    expect(normalizeLessonDurations(null)).toEqual(DEFAULT_LESSON_DURATIONS)
  })
})
