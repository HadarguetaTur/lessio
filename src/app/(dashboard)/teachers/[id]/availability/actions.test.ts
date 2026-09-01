import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockRequireMutation, mockFrom } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: async (key: string) => `common.errors.${key}`,
}))

import { createAvailability, updateAvailability } from './actions'

const TEACHER = 'teacher-1'

interface Row {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
}

/**
 * Stands in for the `availability` table: reads are filtered by whatever .eq()
 * calls the action made, and writes are captured so a test can assert that a
 * rejected submission wrote nothing at all.
 */
function setupTable(existing: Row[]) {
  const inserted: Record<string, unknown>[][] = []
  const updated: Record<string, unknown>[] = []

  const matching = (filters: Record<string, unknown>): Row[] =>
    existing.filter((row) => {
      if (filters.teacher_id !== undefined && filters.teacher_id !== TEACHER) return false
      if (filters.id !== undefined && filters.id !== row.id) return false
      if (filters.day_of_week !== undefined && filters.day_of_week !== row.day_of_week) return false
      return true
    })

  mockFrom.mockImplementation((table: string) => {
    if (table !== 'availability') throw new Error(`Unexpected table: ${table}`)

    // One chainable builder for every read shape the lib uses: eq/order in any
    // order, terminating in either await or .maybeSingle().
    const readChain = () => {
      const filters: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return chain
        },
        maybeSingle: async () => ({ data: matching(filters)[0] ?? null }),
        then: (
          resolve: (value: { data: Row[]; error: null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve({ data: matching(filters), error: null }).then(resolve, reject),
      }
      return chain
    }

    const updateChain = (patch: Record<string, unknown>) => {
      const chain = {
        eq: () => chain,
        then: (
          resolve: (value: { error: null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) => {
          updated.push(patch)
          return Promise.resolve({ error: null }).then(resolve, reject)
        },
      }
      return chain
    }

    return {
      select: () => readChain(),
      insert: async (rows: Record<string, unknown>[]) => {
        inserted.push(rows)
        return { error: null }
      },
      update: (patch: Record<string, unknown>) => updateChain(patch),
    }
  })

  return { inserted, updated }
}

function form(entries: [string, string][]): FormData {
  const fd = new FormData()
  for (const [key, value] of entries) fd.append(key, value)
  return fd
}

describe('createAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner' })
  })

  it('writes one row per selected day in a single insert', async () => {
    const { inserted } = setupTable([])

    const result = await createAvailability(
      TEACHER,
      null,
      form([
        ['day_of_week', '0'],
        ['day_of_week', '1'],
        ['day_of_week', '2'],
        ['start_time', '16:00'],
        ['end_time', '20:00'],
      ])
    )

    expect(result).toBeNull()
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toEqual([
      { organization_id: 'org-1', teacher_id: TEACHER, day_of_week: 0, start_time: '16:00', end_time: '20:00' },
      { organization_id: 'org-1', teacher_id: TEACHER, day_of_week: 1, start_time: '16:00', end_time: '20:00' },
      { organization_id: 'org-1', teacher_id: TEACHER, day_of_week: 2, start_time: '16:00', end_time: '20:00' },
    ])
  })

  it('writes nothing when one of the selected days overlaps', async () => {
    // All-or-nothing: a partial insert cannot be explained in one message.
    const { inserted } = setupTable([
      { id: 'a', day_of_week: 1, start_time: '17:00', end_time: '19:00' },
    ])

    const result = await createAvailability(
      TEACHER,
      null,
      form([
        ['day_of_week', '0'],
        ['day_of_week', '1'],
        ['start_time', '16:00'],
        ['end_time', '20:00'],
      ])
    )

    expect(result?.error).toBe('teacherSelf.errors.overlappingDays')
    expect(inserted).toHaveLength(0)
  })

  it('rejects a submission with no day selected', async () => {
    const { inserted } = setupTable([])

    const result = await createAvailability(
      TEACHER,
      null,
      form([
        ['start_time', '16:00'],
        ['end_time', '20:00'],
      ])
    )

    expect(result?.error).toBe('teacherSelf.errors.pickDays')
    expect(inserted).toHaveLength(0)
  })

  it('refuses a role that is neither owner nor admin', async () => {
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'teacher' })
    const { inserted } = setupTable([])

    const result = await createAvailability(
      TEACHER,
      null,
      form([
        ['day_of_week', '1'],
        ['start_time', '16:00'],
        ['end_time', '20:00'],
      ])
    )

    expect(result?.error).toBe('common.errors.noPermission')
    expect(inserted).toHaveLength(0)
  })
})

describe('updateAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner' })
  })

  it('retimes a window without colliding with itself', async () => {
    const { updated } = setupTable([
      { id: 'a', day_of_week: 1, start_time: '16:00', end_time: '20:00' },
    ])

    const result = await updateAvailability(
      TEACHER,
      null,
      form([
        ['id', 'a'],
        ['start_time', '16:00'],
        ['end_time', '21:00'],
      ])
    )

    expect(result).toBeNull()
    expect(updated).toEqual([{ start_time: '16:00', end_time: '21:00' }])
  })

  it('rejects a window that does not belong to the teacher in the URL', async () => {
    // teacherId comes from the route, so this is the tampering guard.
    const { updated } = setupTable([
      { id: 'a', day_of_week: 1, start_time: '16:00', end_time: '20:00' },
    ])

    const result = await updateAvailability(
      'other-teacher',
      null,
      form([
        ['id', 'a'],
        ['start_time', '16:00'],
        ['end_time', '21:00'],
      ])
    )

    expect(result?.error).toBe('teacherSelf.errors.windowNotFound')
    expect(updated).toHaveLength(0)
  })

  it('rejects an end time that is not after the start', async () => {
    const { updated } = setupTable([
      { id: 'a', day_of_week: 1, start_time: '16:00', end_time: '20:00' },
    ])

    const result = await updateAvailability(
      TEACHER,
      null,
      form([
        ['id', 'a'],
        ['start_time', '20:00'],
        ['end_time', '16:00'],
      ])
    )

    expect(result?.error).toBe('teacherSelf.errors.endAfterStart')
    expect(updated).toHaveLength(0)
  })
})
