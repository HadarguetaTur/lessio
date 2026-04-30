import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStudentsReport } from './students'

let lessonsUsedDateFilter = false

const studentsData = [
  { id: 'student-old', full_name: 'תלמיד ותיק' },
  { id: 'student-recent', full_name: 'תלמיד פעיל' },
]

const lessonsData = [
  {
    start_at: '2026-01-10T09:00:00.000Z',
    lesson_students: [{ student_id: 'student-old' }],
  },
  {
    start_at: '2026-04-10T09:00:00.000Z',
    lesson_students: [{ student_id: 'student-recent' }],
  },
]

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => buildTableChain(table) }),
}))

describe('getStudentsReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))
    lessonsUsedDateFilter = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the real last lesson date even when the student is at risk', async () => {
    const result = await getStudentsReport('org-1', 'UTC')

    expect(lessonsUsedDateFilter).toBe(false)
    expect(result.rows).toEqual([
      {
        studentId: 'student-old',
        studentName: 'תלמיד ותיק',
        lastLessonAt: '2026-01-10T09:00:00.000Z',
        lessonsLast30Days: 0,
        isAtRisk: true,
      },
      {
        studentId: 'student-recent',
        studentName: 'תלמיד פעיל',
        lastLessonAt: '2026-04-10T09:00:00.000Z',
        lessonsLast30Days: 1,
        isAtRisk: false,
      },
    ])
    expect(result.atRiskCount).toBe(1)
  })
})

function buildTableChain(table: string) {
  let result =
    table === 'students'
      ? { data: studentsData, error: null }
      : { data: lessonsData, error: null }

  const self: Record<string, unknown> = {}
  const pass = () => self

  ;['select', 'eq', 'neq', 'order'].forEach((method) => {
    self[method] = pass
  })

  self['gte'] = (field: string, value: string) => {
    if (table === 'lessons' && field === 'start_at') {
      lessonsUsedDateFilter = true
      result = {
        data: lessonsData.filter((lesson) => lesson.start_at >= value),
        error: null,
      }
    }
    return self
  }

  self['then'] = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)

  return self
}
