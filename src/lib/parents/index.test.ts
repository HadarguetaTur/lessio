import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Teacher scoping for parents.
 *
 * The sidebar calls this list "ההורים שלי" and it used to return every family
 * in the organisation, phone numbers included, while the sibling students page
 * scoped correctly (UX audit F4). These cover both halves of the rule — the
 * assigned student and the shared lesson — plus the by-id guard behind the
 * detail sheet.
 */

type Row = Record<string, unknown>

/** Seeded per table; every builder method returns the chain, awaiting resolves. */
function makeDb(tables: Record<string, Row[]>) {
  const calls: { table: string; filters: [string, unknown][] }[] = []

  const from = vi.fn((table: string) => {
    const record = { table, filters: [] as [string, unknown][] }
    calls.push(record)
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'order', 'or']) {
      chain[method] = vi.fn(() => chain)
    }
    chain.eq = vi.fn((col: string, val: unknown) => {
      record.filters.push([col, val])
      return chain
    })
    chain.in = vi.fn((col: string, val: unknown) => {
      record.filters.push([col, val])
      return chain
    })
    chain.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve)
    return chain
  })

  return { db: { from }, calls }
}

const mockClient = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockClient.current,
}))

const { getParents, canTeacherAccessParent } = await import('./index')

const ORG = 'org-1'
const TEACHER = 'teacher-1'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getParents with a teacherId', () => {
  it('returns only the families of students the teacher is assigned', async () => {
    const { db, calls } = makeDb({
      students: [{ id: 's1' }, { id: 's2' }],
      lesson_students: [],
      relationships: [{ parent_id: 'p1' }, { parent_id: 'p2' }, { parent_id: 'p1' }],
      parents: [{ id: 'p1', full_name: 'A' }, { id: 'p2', full_name: 'B' }],
    })
    mockClient.current = db

    const result = await getParents(ORG, { teacherId: TEACHER })

    expect(result).toHaveLength(2)
    const parentsQuery = calls.find((c) => c.table === 'parents')!
    // Deduplicated, and constrained to the allowed set rather than the whole org.
    expect(parentsQuery.filters).toContainEqual(['id', ['p1', 'p2']])
    expect(parentsQuery.filters).toContainEqual(['organization_id', ORG])
  })

  it('includes families reached only through a shared lesson', async () => {
    const { db, calls } = makeDb({
      students: [],
      lesson_students: [{ student_id: 's9' }],
      relationships: [{ parent_id: 'p9' }],
      parents: [{ id: 'p9', full_name: 'Covered' }],
    })
    mockClient.current = db

    await getParents(ORG, { teacherId: TEACHER })

    const rel = calls.find((c) => c.table === 'relationships')!
    expect(rel.filters).toContainEqual(['student_id', ['s9']])
  })

  it('returns nothing, and never queries parents, when the teacher has no students', async () => {
    const { db, calls } = makeDb({
      students: [],
      lesson_students: [],
      relationships: [],
      parents: [{ id: 'p1', full_name: 'Should not be reached' }],
    })
    mockClient.current = db

    const result = await getParents(ORG, { teacherId: TEACHER })

    expect(result).toEqual([])
    expect(calls.some((c) => c.table === 'parents')).toBe(false)
  })

  it('is unscoped without a teacherId, as owners and admins expect', async () => {
    const { db, calls } = makeDb({
      parents: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    })
    mockClient.current = db

    const result = await getParents(ORG)

    expect(result).toHaveLength(3)
    const parentsQuery = calls.find((c) => c.table === 'parents')!
    expect(parentsQuery.filters.some(([col]) => col === 'id')).toBe(false)
  })
})

describe('canTeacherAccessParent', () => {
  it('allows a parent linked to one of the teacher\'s students', async () => {
    const { db } = makeDb({
      students: [{ id: 's1' }],
      lesson_students: [],
      relationships: [{ parent_id: 'p1' }],
    })
    mockClient.current = db

    await expect(canTeacherAccessParent(ORG, TEACHER, 'p1')).resolves.toBe(true)
  })

  it('refuses a parent from another teacher\'s roster', async () => {
    const { db } = makeDb({
      students: [{ id: 's1' }],
      lesson_students: [],
      relationships: [{ parent_id: 'p1' }],
    })
    mockClient.current = db

    await expect(canTeacherAccessParent(ORG, TEACHER, 'p-other')).resolves.toBe(false)
  })

  it('refuses when the teacher has no students at all', async () => {
    const { db } = makeDb({ students: [], lesson_students: [], relationships: [] })
    mockClient.current = db

    await expect(canTeacherAccessParent(ORG, TEACHER, 'p1')).resolves.toBe(false)
  })
})
