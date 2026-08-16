import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { getActiveGoalsForStudents } from './index'

function makeClient(result: { data: unknown[] | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn().mockResolvedValue(result),
  })
  return { from: vi.fn(() => ({ select: vi.fn(() => builder) })) }
}

describe('getActiveGoalsForStudents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns [] without querying when the parent has no linked students', async () => {
    const result = await getActiveGoalsForStudents('org-1', [])

    expect(result).toEqual([])
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })

  it('degrades to [] on a query error instead of throwing', async () => {
    // This feeds the parent portal home page, which has no error boundary below the
    // root one — a throw here replaced the entire portal with "משהו השתבש".
    mockCreateServiceRoleClient.mockReturnValue(
      makeClient({ data: null, error: { message: 'relation "student_goals" does not exist' } })
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getActiveGoalsForStudents('org-1', ['student-1'])).resolves.toEqual([])
    expect(spy).toHaveBeenCalled()

    spy.mockRestore()
  })

  it('maps rows and flattens the embedded student name', async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      makeClient({
        data: [
          {
            id: 'goal-1',
            organization_id: 'org-1',
            student_id: 'student-1',
            created_by: 'profile-1',
            subject: 'מתמטיקה',
            description: 'להגיע ל-90 במבחן',
            target_date: '2026-09-01',
            status: 'active',
            created_at: '2026-08-01T00:00:00Z',
            updated_at: '2026-08-01T00:00:00Z',
            students: { full_name: 'דנה' },
          },
        ],
        error: null,
      })
    )

    const [goal] = await getActiveGoalsForStudents('org-1', ['student-1'])

    expect(goal.studentName).toBe('דנה')
    expect(goal.subject).toBe('מתמטיקה')
  })
})
