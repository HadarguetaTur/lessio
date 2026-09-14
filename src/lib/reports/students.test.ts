import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStudentsReport } from './students'

let rpcArgs: Record<string, unknown> | null = null

const studentsData = [
  { id: 'student-old', full_name: 'תלמיד ותיק' },
  { id: 'student-recent', full_name: 'תלמיד פעיל' },
]

// What the student_lesson_activity SQL function returns: the all-time last
// lesson and the count since the cutoff (bigint, so PostgREST sends a string).
const activityData = [
  { student_id: 'student-old', last_lesson_at: '2026-01-10T09:00:00.000Z', lessons_since: '0' },
  { student_id: 'student-recent', last_lesson_at: '2026-04-10T09:00:00.000Z', lessons_since: '1' },
]

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => buildTableChain(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcArgs = { fn, ...args }
      return Promise.resolve({ data: activityData, error: null })
    },
  }),
}))

describe('getStudentsReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))
    rpcArgs = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the real last lesson date even when the student is at risk', async () => {
    const result = await getStudentsReport('org-1', 'UTC')

    expect(rpcArgs).toEqual({
      fn: 'student_lesson_activity',
      p_org_id: 'org-1',
      p_since: '2026-03-16T12:00:00.000Z',
    })
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
  const result =
    table === 'students'
      ? { data: studentsData, error: null }
      : { data: [], error: new Error(`unexpected table ${table}`) }

  const self: Record<string, unknown> = {}
  const pass = () => self

  ;['select', 'eq', 'neq', 'order', 'gte'].forEach((method) => {
    self[method] = pass
  })

  self['then'] = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)

  return self
}
