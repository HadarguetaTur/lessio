import { describe, it, expect } from 'vitest'
import { preserveCalendarParams, withTeacherParam } from './calendarParams'

describe('withTeacherParam', () => {
  it('sets the teacher and keeps every other param in place', () => {
    const url = withTeacherParam(
      new URLSearchParams('view=month&month=2026-09&student=s1&cancelled=1'),
      't2'
    )
    const params = new URLSearchParams(url.split('?')[1])
    expect(url.startsWith('/lessons?')).toBe(true)
    expect(params.get('teacher')).toBe('t2')
    expect(params.get('view')).toBe('month')
    expect(params.get('month')).toBe('2026-09')
    expect(params.get('student')).toBe('s1')
    expect(params.get('cancelled')).toBe('1')
  })

  it('replaces an existing teacher rather than appending a second one', () => {
    const url = withTeacherParam(new URLSearchParams('week=2026-09-13&teacher=t1'), 't2')
    expect(url).toBe('/lessons?week=2026-09-13&teacher=t2')
  })

  it('clears the filter for "all teachers" and keeps the week', () => {
    const url = withTeacherParam(new URLSearchParams('week=2026-09-13&teacher=t1'), null)
    expect(url).toBe('/lessons?week=2026-09-13')
  })

  it('returns the bare path when nothing is left', () => {
    expect(withTeacherParam(new URLSearchParams('teacher=t1'), null)).toBe('/lessons')
  })
})

describe('preserveCalendarParams', () => {
  it('copies only the student and cancelled params', () => {
    const into = preserveCalendarParams(
      new URLSearchParams('student=s1&cancelled=1&teacher=t1&week=2026-09-13'),
      new URLSearchParams({ week: '2026-09-20' })
    )
    expect(into.get('student')).toBe('s1')
    expect(into.get('cancelled')).toBe('1')
    expect(into.get('teacher')).toBeNull()
    expect(into.get('week')).toBe('2026-09-20')
  })
})
