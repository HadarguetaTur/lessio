import { describe, it, expect } from 'vitest'
import { topAtRiskStudents } from './attention'
import type { StudentRow } from '@/lib/reports/students'

function row(overrides: Partial<StudentRow> & { studentId: string }): StudentRow {
  return {
    studentName: `Student ${overrides.studentId}`,
    lastLessonAt: null,
    lessonsLast30Days: 0,
    isAtRisk: true,
    ...overrides,
  }
}

describe('topAtRiskStudents', () => {
  it('filters to at-risk rows only', () => {
    const rows = [
      row({ studentId: 'a', isAtRisk: false, lessonsLast30Days: 3 }),
      row({ studentId: 'b' }),
    ]
    expect(topAtRiskStudents(rows).map((r) => r.studentId)).toEqual(['b'])
  })

  it('puts students who never had a lesson first', () => {
    const rows = [
      row({ studentId: 'had-lesson', lastLessonAt: '2026-07-01T10:00:00.000Z' }),
      row({ studentId: 'never', lastLessonAt: null }),
    ]
    expect(topAtRiskStudents(rows).map((r) => r.studentId)).toEqual(['never', 'had-lesson'])
  })

  it('orders by oldest last lesson after the never-had group', () => {
    const rows = [
      row({ studentId: 'recent', lastLessonAt: '2026-07-20T10:00:00.000Z' }),
      row({ studentId: 'old', lastLessonAt: '2026-06-01T10:00:00.000Z' }),
      row({ studentId: 'never', lastLessonAt: null }),
    ]
    expect(topAtRiskStudents(rows).map((r) => r.studentId)).toEqual(['never', 'old', 'recent'])
  })

  it('respects the limit', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ studentId: `s${i}` }))
    expect(topAtRiskStudents(rows, 5)).toHaveLength(5)
  })

  it('returns an empty array for empty input', () => {
    expect(topAtRiskStudents([])).toEqual([])
  })

  it('maps only the fields the panel needs', () => {
    const result = topAtRiskStudents([
      row({ studentId: 'a', studentName: 'דנה לוי', lastLessonAt: '2026-07-01T10:00:00.000Z' }),
    ])
    expect(result).toEqual([
      { studentId: 'a', studentName: 'דנה לוי', lastLessonAt: '2026-07-01T10:00:00.000Z' },
    ])
  })
})
