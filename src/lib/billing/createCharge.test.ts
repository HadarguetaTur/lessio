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

vi.mock('@/lib/organizations/pricing', () => ({
  getOrgPricing: vi.fn(),
}))

// Charge creation resolves a due date, which needs the org's timezone. Mocked
// rather than added to every `from()` fixture below — the tests here are about
// amounts and idempotency, not about which zone the org keeps.
vi.mock('@/lib/organizations', () => ({
  getOrgTimezone: vi.fn().mockResolvedValue('Asia/Jerusalem'),
}))

import { createCancellationCharge, createLessonCharge } from './createCharge'
import { resolveBillingParent, MissingPrimaryParentError } from './resolveBillingParent'
import { getOrgPricing } from '@/lib/organizations/pricing'

const mockResolveBillingParent = vi.mocked(resolveBillingParent)
const mockGetOrgPricing = vi.mocked(getOrgPricing)

/** Org with no individual default set — teacher rate is the only source. */
const NO_ORG_RATE = {
  individualHourlyRate: null,
  pairPricePerStudent: 112.5,
  groupPricePerStudent: 120,
  subscriptionCoveredLessonTypes: ['pair', 'group', 'custom'] as const,
}

function single(data: unknown, error: unknown = null) {
  const self: Record<string, unknown> = {}
  const pass = () => self
  ;['select', 'eq'].forEach((method) => {
    self[method] = pass
  })
  self['single'] = () => Promise.resolve({ data, error })
  return self
}

/** The subscription coverage lookup: select().eq().in() resolves to the rows. */
function subscriptionList(rows: unknown[], error: unknown = null) {
  const self: Record<string, unknown> = {}
  self['select'] = () => self
  self['eq'] = () => self
  self['in'] = () => Promise.resolve({ data: rows, error })
  return self
}

/** An unpaused, open-ended subscription covering the April 2026 test lessons. */
function activeSub(studentId: string) {
  return { student_id: studentId, start_date: '2026-01-01', end_date: null, is_paused: false }
}

describe('createLessonCharge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOrgPricing.mockResolvedValue(NO_ORG_RATE)
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

      if (table === 'charge_audit_log') {
        return { insert: async () => ({ error: null }) }
      }

      if (table === 'charges') {
        return {
          insert: (payload: Record<string, unknown>) => {
            inserted.push(payload)
            return {
              select: () => ({ single: async () => ({ data: { id: 'charge-1' }, error: null }) }),
            }
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
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              }),
            }),
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

  it('falls back to the org default rate when the teacher has none', async () => {
    const inserted: Record<string, unknown>[] = []

    mockGetOrgPricing.mockResolvedValue({ ...NO_ORG_RATE, individualHourlyRate: 100 })
    mockResolveBillingParent.mockResolvedValue('parent-1')
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') {
        return single({
          id: 'lesson-1',
          start_at: '2026-04-01T10:00:00.000Z',
          end_at: '2026-04-01T11:00:00.000Z',
          lesson_type: 'individual',
          price_per_student: null,
          lesson_students: [{ student_id: 'student-1' }],
          teachers: { id: 'teacher-1', hourly_rate: null },
        })
      }
      if (table === 'charge_audit_log') return { insert: async () => ({ error: null }) }
      if (table === 'charges') {
        return {
          insert: (payload: Record<string, unknown>) => {
            inserted.push(payload)
            return {
              select: () => ({ single: async () => ({ data: { id: 'charge-1' }, error: null }) }),
            }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ amount: 100 })
  })

  it('charges every family in a pair lesson at the per-student price', async () => {
    const inserted: Record<string, unknown>[] = []

    mockResolveBillingParent.mockImplementation(async (studentId: string) =>
      studentId === 'student-1' ? 'parent-1' : 'parent-2'
    )
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') {
        return single({
          id: 'lesson-1',
          start_at: '2026-04-01T10:00:00.000Z',
          end_at: '2026-04-01T11:00:00.000Z',
          lesson_type: 'pair',
          price_per_student: null, // → org default
          lesson_students: [{ student_id: 'student-1' }, { student_id: 'student-2' }],
          teachers: { id: 'teacher-1', hourly_rate: 200 },
        })
      }
      if (table === 'subscriptions') return subscriptionList([])
      if (table === 'charge_audit_log') return { insert: async () => ({ error: null }) }
      if (table === 'charges') {
        return {
          insert: (payload: Record<string, unknown>) => {
            inserted.push(payload)
            return {
              select: () => ({ single: async () => ({ data: { id: `charge-${inserted.length}` }, error: null }) }),
            }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
    expect(inserted).toHaveLength(2)
    // Per-student price, not the teacher's hourly rate.
    expect(inserted.map((c) => c.amount)).toEqual([112.5, 112.5])
    expect(inserted.map((c) => c.parent_id)).toEqual(['parent-1', 'parent-2'])
  })

  it('uses the per-lesson price for a custom lesson', async () => {
    const inserted: Record<string, unknown>[] = []

    mockResolveBillingParent.mockResolvedValue('parent-1')
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') {
        return single({
          id: 'lesson-1',
          start_at: '2026-04-01T10:00:00.000Z',
          end_at: '2026-04-01T10:50:00.000Z',
          lesson_type: 'custom',
          price_per_student: 85,
          lesson_students: [{ student_id: 'student-1' }],
          teachers: { id: 'teacher-1', hourly_rate: 200 },
        })
      }
      if (table === 'subscriptions') return subscriptionList([])
      if (table === 'charge_audit_log') return { insert: async () => ({ error: null }) }
      if (table === 'charges') {
        return {
          insert: (payload: Record<string, unknown>) => {
            inserted.push(payload)
            return {
              select: () => ({ single: async () => ({ data: { id: 'charge-1' }, error: null }) }),
            }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
    expect(inserted[0]).toMatchObject({ amount: 85 })
  })

  describe('subscription coverage', () => {
    /** A group lesson with the given roster, plus a charges spy. */
    function groupLesson(
      studentIds: string[],
      subs: unknown[],
      inserted: Record<string, unknown>[],
      lessonType = 'group'
    ) {
      return (table: string) => {
        if (table === 'lessons') {
          return single({
            id: 'lesson-1',
            start_at: '2026-04-01T10:00:00.000Z',
            end_at: '2026-04-01T11:00:00.000Z',
            lesson_type: lessonType,
            price_per_student: null,
            lesson_students: studentIds.map((student_id) => ({ student_id })),
            teachers: { id: 'teacher-1', hourly_rate: 200 },
          })
        }
        if (table === 'subscriptions') return subscriptionList(subs)
        if (table === 'charge_audit_log') return { insert: async () => ({ error: null }) }
        if (table === 'charges') {
          return {
            insert: (payload: Record<string, unknown>) => {
              inserted.push(payload)
              return {
                select: () => ({ single: async () => ({ data: { id: `charge-${inserted.length}` }, error: null }) }),
              }
            },
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      }
    }

    it('does not charge a subscribed student for a covered group lesson', async () => {
      const inserted: Record<string, unknown>[] = []
      mockResolveBillingParent.mockResolvedValue('parent-1')
      mockFrom.mockImplementation(groupLesson(['student-1'], [activeSub('student-1')], inserted))

      // Fully covered roster charges nothing — and that is not an error.
      await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
      expect(inserted).toHaveLength(0)
    })

    it('charges only the unsubscribed student in a mixed group lesson', async () => {
      const inserted: Record<string, unknown>[] = []
      mockResolveBillingParent.mockImplementation(async (studentId: string) =>
        studentId === 'student-1' ? 'parent-1' : 'parent-2'
      )
      mockFrom.mockImplementation(
        groupLesson(['student-1', 'student-2'], [activeSub('student-1')], inserted)
      )

      await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
      expect(inserted).toHaveLength(1)
      expect(inserted[0]).toMatchObject({ parent_id: 'parent-2', amount: 120 })
    })

    it('still charges an individual lesson under the default policy', async () => {
      const inserted: Record<string, unknown>[] = []
      mockResolveBillingParent.mockResolvedValue('parent-1')
      // 'individual' is not in the covered set, so no subscription lookup happens.
      mockFrom.mockImplementation(
        groupLesson(['student-1'], [activeSub('student-1')], inserted, 'individual')
      )

      await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
      expect(inserted).toHaveLength(1)
      expect(inserted[0]).toMatchObject({ amount: 200 })
    })

    it('skips an individual lesson when the org policy covers it', async () => {
      const inserted: Record<string, unknown>[] = []
      mockGetOrgPricing.mockResolvedValue({
        ...NO_ORG_RATE,
        subscriptionCoveredLessonTypes: ['individual', 'pair', 'group', 'custom'] as const,
      })
      mockResolveBillingParent.mockResolvedValue('parent-1')
      mockFrom.mockImplementation(
        groupLesson(['student-1'], [activeSub('student-1')], inserted, 'individual')
      )

      await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
      expect(inserted).toHaveLength(0)
    })

    it('charges a student whose subscription is paused', async () => {
      const inserted: Record<string, unknown>[] = []
      mockResolveBillingParent.mockResolvedValue('parent-1')
      mockFrom.mockImplementation(
        groupLesson(
          ['student-1'],
          [{ ...activeSub('student-1'), is_paused: true }],
          inserted
        )
      )

      await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
      expect(inserted).toHaveLength(1)
      expect(inserted[0]).toMatchObject({ amount: 120 })
    })

    it('charges a student whose subscription ended before the lesson', async () => {
      const inserted: Record<string, unknown>[] = []
      mockResolveBillingParent.mockResolvedValue('parent-1')
      mockFrom.mockImplementation(
        groupLesson(
          ['student-1'],
          [{ ...activeSub('student-1'), end_date: '2026-03-01' }],
          inserted
        )
      )

      await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toBeNull()
      expect(inserted).toHaveLength(1)
    })

    it('fails loud rather than charging when the coverage lookup breaks', async () => {
      const inserted: Record<string, unknown>[] = []
      mockResolveBillingParent.mockResolvedValue('parent-1')
      mockFrom.mockImplementation((table: string) => {
        if (table === 'lessons') {
          return single({
            id: 'lesson-1',
            start_at: '2026-04-01T10:00:00.000Z',
            end_at: '2026-04-01T11:00:00.000Z',
            lesson_type: 'group',
            price_per_student: null,
            lesson_students: [{ student_id: 'student-1' }],
            teachers: { id: 'teacher-1', hourly_rate: 200 },
          })
        }
        if (table === 'subscriptions') return subscriptionList(null as unknown as unknown[], { message: 'boom' })
        throw new Error(`Unexpected table: ${table}`)
      })

      const result = await createLessonCharge('lesson-1', 'org-1')
      expect(result).toMatchObject({ type: 'error' })
      expect(inserted).toHaveLength(0)
    })
  })

  it('refuses to guess a price for a custom lesson that has none', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'lessons') {
        return single({
          id: 'lesson-1',
          start_at: '2026-04-01T10:00:00.000Z',
          end_at: '2026-04-01T11:00:00.000Z',
          lesson_type: 'custom',
          price_per_student: null,
          lesson_students: [{ student_id: 'student-1' }],
          teachers: { id: 'teacher-1', hourly_rate: 200 },
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(createLessonCharge('lesson-1', 'org-1')).resolves.toEqual({
      type: 'missing_price',
      message: 'validation.noLessonPrice',
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
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              }),
            }),
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
