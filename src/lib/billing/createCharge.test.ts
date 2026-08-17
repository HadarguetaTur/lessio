import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('./resolveBillingParent', async () => {
  const actual = await vi.importActual<typeof import('./resolveBillingParent')>('./resolveBillingParent')
  return {
    ...actual,
    resolveBillingParent: vi.fn(),
  }
})

import { createCancellationCharge, createLessonCharge } from './createCharge'
import { resolveBillingParent, MissingPrimaryParentError } from './resolveBillingParent'

const mockResolveBillingParent = vi.mocked(resolveBillingParent)

function single(data: unknown, error: unknown = null) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq'].forEach((method) => {
    self[method] = pass
  })
  self['single'] = () => Promise.resolve({ data, error })
  return self
}

describe('createLessonCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates exactly one lesson charge for a completed lesson', async () => {
    const inserted: Record<string, unknown>[] = []

    mockResolveBillingParent.mockResolvedValue('parent-1')
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') {
        return single({
          id: 'lesson-1',
          start_at: '2026-04-01T10:00:00.000Z',
          end_at: '2026-04-01T11:30:00.000Z',
          lesson_students: [{ student_id: 'student-1' }],
          teachers: { id: 'teacher-1', hourly_rate: 200 },
        })
      }

      if (table === 'charges') {
        return {
          insert: async (payload: Record<string, unknown>) => {
            inserted.push(payload)
            return { error: null }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await createLessonCharge('lesson-1', 'org-1')

    expect(result).toBeNull()
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      organization_id: 'org-1',
      parent_id: 'parent-1',
      lesson_id: 'lesson-1',
      amount: 300,
      charge_type: 'lesson',
      status: 'pending',
    })
  })

  it('silently ignores duplicate retries', async () => {
    mockResolveBillingParent.mockResolvedValue('parent-1')
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') {
        return single({
          id: 'lesson-1',
          start_at: '2026-04-01T10:00:00.000Z',
          end_at: '2026-04-01T11:00:00.000Z',
          lesson_students: [{ student_id: 'student-1' }],
          teachers: { id: 'teacher-1', hourly_rate: 200 },
        })
      }

      if (table === 'charges') {
        return {
          insert: async () => ({
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
  })

  it('returns a clear alert when the teacher is missing hourly_rate', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') {
        return single({
          id: 'lesson-1',
          start_at: '2026-04-01T10:00:00.000Z',
          end_at: '2026-04-01T11:00:00.000Z',
          lesson_students: [{ student_id: 'student-1' }],
          teachers: { id: 'teacher-1', hourly_rate: null },
        })
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toEqual({
      type: 'missing_rate',
      // A catalog key, not display copy — the calling action translates it.
      message: 'validation.noTeacherRate',
    })
  })

  it('returns a clear alert when the student has no primary parent', async () => {
    mockResolveBillingParent.mockRejectedValue(new MissingPrimaryParentError('student-1'))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') {
        return single({
          id: 'lesson-1',
          start_at: '2026-04-01T10:00:00.000Z',
          end_at: '2026-04-01T11:00:00.000Z',
          lesson_students: [{ student_id: 'student-1' }],
          teachers: { id: 'teacher-1', hourly_rate: 200 },
        })
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toEqual({
      type: 'missing_parent',
      message: 'validation.noPrimaryParent',
    })
  })
})

describe('createCancellationCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('silently ignores duplicate cancellation retries', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'charges') {
        return {
          insert: async () => ({
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(
      createCancellationCharge('lesson-1', 'org-1', 'parent-1', {
        shouldCharge: true,
        chargeType: 'full',
        amount: 120,
        reasonCode: 'late_cancel',
      })
    ).resolves.toBeNull()
  })
})
