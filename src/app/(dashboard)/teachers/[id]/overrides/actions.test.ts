import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockRequireMutation, mockFrom, mockServiceFrom, mockCancelAndNotify } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockRequireMutation: vi.fn(),
    mockFrom: vi.fn(),
    mockServiceFrom: vi.fn(),
    mockCancelAndNotify: vi.fn(),
  }))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (table: string) => mockFrom(table) }),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: (table: string) => mockServiceFrom(table) }),
}))

vi.mock('@/lib/teachers', () => ({
  getTeacherById: async () => ({ id: 'teacher-1', profile: { full_name: 'Dana' } }),
}))

vi.mock('@/lib/day-off/cancelForAbsence', () => ({
  cancelAndNotify: mockCancelAndNotify,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))
vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: async (key: string) => `common.errors.${key}`,
}))

import { createOverrideAction, updateOverrideAction } from './actions'

const TEACHER = 'teacher-1'
const DATE = '2026-09-15'

interface Row {
  id: string
  override_date: string
  is_available: boolean
  start_time: string | null
  end_time: string | null
  reason: string | null
  created_at: string
}

function row(partial: Partial<Row> & { id: string }): Row {
  return {
    override_date: DATE,
    is_available: false,
    start_time: null,
    end_time: null,
    reason: null,
    created_at: '2026-09-01T00:00:00Z',
    ...partial,
  }
}

interface Lesson {
  id: string
  start_at: string
  end_at: string
  lesson_students: Array<{ student: { full_name: string } | null }>
}

/**
 * The service-role client the lib uses for the org timezone and the lesson
 * lookup. Lessons default to none, so the confirm step stays out of the way of
 * the validation tests.
 */
function setupServiceTables(lessons: Lesson[] = []) {
  mockServiceFrom.mockImplementation((table: string) => {
    if (table === 'organizations') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { timezone: 'Asia/Jerusalem' } }) }),
        }),
      }
    }
    if (table === 'lessons') {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'lt', 'gt', 'order']) chain[m] = () => chain
      chain['then'] = (resolve: (v: { data: Lesson[] }) => unknown) =>
        Promise.resolve({ data: lessons }).then(resolve)
      return chain
    }
    throw new Error(`Unexpected service table: ${table}`)
  })
}

/** Stands in for availability_overrides; captures every write. */
function setupTable(existing: Row[]) {
  const inserted: Record<string, unknown>[] = []
  const updated: Record<string, unknown>[] = []
  const deleted: Record<string, unknown>[] = []

  const matching = (filters: Record<string, unknown>): Row[] =>
    existing.filter((r) => {
      if (filters.teacher_id !== undefined && filters.teacher_id !== TEACHER) return false
      if (filters.id !== undefined && filters.id !== r.id) return false
      if (filters.override_date !== undefined && filters.override_date !== r.override_date) return false
      return true
    })

  mockFrom.mockImplementation((table: string) => {
    if (table !== 'availability_overrides') throw new Error(`Unexpected table: ${table}`)

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

    const writeChain = (sink: Record<string, unknown>[], payload: Record<string, unknown>) => {
      const chain = {
        eq: () => chain,
        then: (
          resolve: (value: { error: null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) => {
          sink.push(payload)
          return Promise.resolve({ error: null }).then(resolve, reject)
        },
      }
      return chain
    }

    return {
      select: () => readChain(),
      insert: async (payload: Record<string, unknown>) => {
        inserted.push(payload)
        return { error: null }
      },
      update: (payload: Record<string, unknown>) => writeChain(updated, payload),
      delete: () => writeChain(deleted, { deleted: true }),
    }
  })

  return { inserted, updated, deleted }
}

function form(entries: [string, string][]): FormData {
  const fd = new FormData()
  for (const [key, value] of entries) fd.append(key, value)
  return fd
}

const blockRange = (start: string, end: string) =>
  form([
    ['type', 'block_range'],
    ['override_date', DATE],
    ['start_time', start],
    ['end_time', end],
    ['reason', ''],
  ])

describe('createOverrideAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner' })
    setupServiceTables()
  })

  it('writes a blocked range with both times kept', async () => {
    // The old form discarded the times whenever is_available was false, which
    // is why a partial block could not be expressed at all.
    const { inserted } = setupTable([])

    const result = await createOverrideAction(TEACHER, null, blockRange('08:00', '12:00'))

    expect(result).toBeNull()
    expect(inserted).toEqual([
      {
        organization_id: 'org-1',
        teacher_id: TEACHER,
        override_date: DATE,
        is_available: false,
        start_time: '08:00',
        end_time: '12:00',
        reason: null,
      },
    ])
  })

  it('allows a second, non-overlapping range on the same date', async () => {
    const { inserted } = setupTable([
      row({ id: 'a', start_time: '08:00', end_time: '12:00' }),
    ])

    const result = await createOverrideAction(TEACHER, null, blockRange('17:00', '19:00'))

    expect(result).toBeNull()
    expect(inserted).toHaveLength(1)
  })

  it('rejects a range overlapping an existing block', async () => {
    const { inserted } = setupTable([
      row({ id: 'a', start_time: '08:00', end_time: '12:00' }),
    ])

    const result = await createOverrideAction(TEACHER, null, blockRange('11:00', '13:00'))

    expect(result?.error).toBe('teacherSelf.errors.overlappingRange')
    expect(inserted).toHaveLength(0)
  })

  it('allows a block that overlaps special hours — that pairing is the model', async () => {
    const { inserted } = setupTable([
      row({ id: 'a', is_available: true, start_time: '08:00', end_time: '20:00' }),
    ])

    const result = await createOverrideAction(TEACHER, null, blockRange('12:00', '14:00'))

    expect(result).toBeNull()
    expect(inserted).toHaveLength(1)
  })

  it('refuses anything added to a date that is already closed outright', async () => {
    const { inserted } = setupTable([row({ id: 'a' })])

    const result = await createOverrideAction(TEACHER, null, blockRange('08:00', '12:00'))

    expect(result?.error).toBe('teacherSelf.errors.dayAlreadyBlocked')
    expect(inserted).toHaveLength(0)
  })

  it('clears the ranges underneath when the whole day is closed', async () => {
    const { inserted, deleted } = setupTable([
      row({ id: 'a', start_time: '08:00', end_time: '12:00' }),
    ])

    const result = await createOverrideAction(
      TEACHER,
      null,
      form([
        ['type', 'block_day'],
        ['override_date', DATE],
        ['reason', 'vacation'],
      ])
    )

    expect(result).toBeNull()
    expect(deleted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ is_available: false, start_time: null, end_time: null })
  })

  it('rejects an end time that is not after the start', async () => {
    const { inserted } = setupTable([])

    const result = await createOverrideAction(TEACHER, null, blockRange('12:00', '08:00'))

    expect(result?.error).toBe('teacherSelf.errors.endAfterStart')
    expect(inserted).toHaveLength(0)
  })

  it('refuses a role that is neither owner nor admin', async () => {
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'teacher' })
    const { inserted } = setupTable([])

    const result = await createOverrideAction(TEACHER, null, blockRange('08:00', '12:00'))

    expect(result?.error).toBe('common.errors.noPermission')
    expect(inserted).toHaveLength(0)
  })
})

describe('updateOverrideAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner' })
    setupServiceTables()
  })

  it('retimes a range without colliding with itself', async () => {
    const { updated } = setupTable([
      row({ id: 'a', start_time: '08:00', end_time: '12:00' }),
    ])

    const fd = blockRange('08:00', '13:00')
    fd.append('id', 'a')
    const result = await updateOverrideAction(TEACHER, null, fd)

    expect(result).toBeNull()
    expect(updated).toEqual([
      {
        override_date: DATE,
        is_available: false,
        start_time: '08:00',
        end_time: '13:00',
        reason: null,
      },
    ])
  })

  it('rejects a row that belongs to another teacher', async () => {
    // teacherId comes from the route, so this is the tampering guard.
    const { updated } = setupTable([
      row({ id: 'a', start_time: '08:00', end_time: '12:00' }),
    ])

    const fd = blockRange('08:00', '13:00')
    fd.append('id', 'a')
    const result = await updateOverrideAction('other-teacher', null, fd)

    expect(result?.error).toBe('teacherSelf.errors.overrideNotFound')
    expect(updated).toHaveLength(0)
  })
})

describe('createOverrideAction — lessons already in the range', () => {
  const lesson = {
    id: 'lesson-1',
    start_at: '2026-09-15T06:00:00.000Z',
    end_at: '2026-09-15T07:00:00.000Z',
    lesson_students: [{ student: { full_name: 'Noa' } }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSession.mockResolvedValue({ orgId: 'org-1', role: 'owner' })
    mockCancelAndNotify.mockResolvedValue({ cancelled: 1, notified: 1, failed: 0 })
  })

  it('reports the clash and writes nothing on the first submit', async () => {
    // The warning has to be a decision point, not a surprise: nothing is
    // blocked until the reader says what should happen to the lessons.
    setupServiceTables([lesson])
    const { inserted } = setupTable([])

    const result = await createOverrideAction(TEACHER, null, blockRange('08:00', '12:00'))

    expect(result?.needsLessonConfirm).toBe(true)
    expect(result?.lessons).toEqual([
      { id: 'lesson-1', start: '09:00', end: '10:00', students: ['Noa'] },
    ])
    expect(inserted).toHaveLength(0)
    expect(mockCancelAndNotify).not.toHaveBeenCalled()
  })

  it('blocks and cancels when the reader asks for it', async () => {
    setupServiceTables([lesson])
    const { inserted } = setupTable([])

    const fd = blockRange('08:00', '12:00')
    fd.append('lesson_action', 'cancel')
    const result = await createOverrideAction(TEACHER, null, fd)

    expect(inserted).toHaveLength(1)
    expect(mockCancelAndNotify).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ cancelled: 1, notified: 1 })

    // The absence handed to the cancel path is the block, in org time:
    // 08:00–12:00 Jerusalem on 15/09 is 05:00–09:00 UTC.
    const window = mockCancelAndNotify.mock.calls[0][0]
    expect(window).toMatchObject({
      orgId: 'org-1',
      teacherId: TEACHER,
      gte: '2026-09-15T05:00:00.000Z',
      lt: '2026-09-15T09:00:00.000Z',
      teacherName: 'Dana',
    })
    // The label rides in the approved template's date_range slot.
    expect(window.label).toBe('15/09/2026, 08:00–12:00')
  })

  it('blocks and leaves the lessons alone when the reader keeps them', async () => {
    setupServiceTables([lesson])
    const { inserted } = setupTable([])

    const fd = blockRange('08:00', '12:00')
    fd.append('lesson_action', 'keep')
    const result = await createOverrideAction(TEACHER, null, fd)

    expect(result).toBeNull()
    expect(inserted).toHaveLength(1)
    expect(mockCancelAndNotify).not.toHaveBeenCalled()
  })

  it('does not ask about lessons when the exception only adds hours', async () => {
    // Special hours open time up; nothing is being taken away.
    setupServiceTables([lesson])
    const { inserted } = setupTable([])

    const result = await createOverrideAction(
      TEACHER,
      null,
      form([
        ['type', 'special_hours'],
        ['override_date', DATE],
        ['start_time', '08:00'],
        ['end_time', '12:00'],
        ['reason', ''],
      ])
    )

    expect(result).toBeNull()
    expect(inserted).toHaveLength(1)
  })

  it('keeps the hours blocked when the cancellation fails', async () => {
    // Cancelling runs after the write, so a failure must not leave the lessons
    // cancelled into a calendar that is still open.
    setupServiceTables([lesson])
    mockCancelAndNotify.mockRejectedValue(new Error('meta down'))
    const { inserted } = setupTable([])

    const fd = blockRange('08:00', '12:00')
    fd.append('lesson_action', 'cancel')
    const result = await createOverrideAction(TEACHER, null, fd)

    expect(inserted).toHaveLength(1)
    expect(result?.error).toBe('teacherSelf.errors.cancelLessonsFailed')
  })
})
