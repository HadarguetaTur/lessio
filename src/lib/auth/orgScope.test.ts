import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import {
  assertBelongsToOrg,
  assertGroupBelongsToOrg,
  assertStudentsBelongToOrg,
  belongsToOrg,
  idsBelongToOrg,
  ORG_SCOPE_VIOLATION,
  OrgScopeError,
} from './orgScope'

/** Records what the query was filtered by, so the org filter itself is testable. */
let lastQuery: { table?: string; orgId?: string; ids?: string[] } = {}

function mockRows(rows: { id: string }[] | null, error: unknown = null) {
  lastQuery = {}
  const inFn = vi.fn().mockImplementation((_col: string, ids: string[]) => {
    lastQuery.ids = ids
    return Promise.resolve({ data: rows, error })
  })
  const eq = vi.fn().mockImplementation((_col: string, orgId: string) => {
    lastQuery.orgId = orgId
    return { in: inFn }
  })
  const select = vi.fn().mockReturnValue({ eq })
  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      lastQuery.table = table
      return { select }
    }),
  })
}

describe('idsBelongToOrg', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters by organization_id, not by id alone', async () => {
    mockRows([{ id: 'g1' }])
    await expect(idsBelongToOrg('student_groups', ['g1'], 'org-a')).resolves.toBe(true)
    expect(lastQuery).toEqual({ table: 'student_groups', orgId: 'org-a', ids: ['g1'] })
  })

  it("rejects an id that exists but belongs to another org (no row comes back)", async () => {
    mockRows([])
    await expect(idsBelongToOrg('student_groups', ['g-of-org-b'], 'org-a')).resolves.toBe(false)
  })

  it('rejects when only some of the ids are in the org', async () => {
    mockRows([{ id: 's1' }])
    await expect(idsBelongToOrg('students', ['s1', 's-org-b'], 'org-a')).resolves.toBe(false)
  })

  it('collapses duplicates before comparing counts', async () => {
    mockRows([{ id: 's1' }])
    await expect(idsBelongToOrg('students', ['s1', 's1', 's1'], 'org-a')).resolves.toBe(true)
    expect(lastQuery.ids).toEqual(['s1'])
  })

  it('fails closed when the lookup errors', async () => {
    mockRows(null, { message: 'connection reset' })
    await expect(idsBelongToOrg('students', ['s1'], 'org-a')).resolves.toBe(false)
  })

  it('does not query at all for an empty id list', async () => {
    mockRows([])
    await expect(idsBelongToOrg('students', [], 'org-a')).resolves.toBe(true)
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })
})

describe('belongsToOrg', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an empty id without querying', async () => {
    mockRows([{ id: 'x' }])
    await expect(belongsToOrg('students', '', 'org-a')).resolves.toBe(false)
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled()
  })
})

describe('assert helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws OrgScopeError with a stable code for a foreign row', async () => {
    mockRows([])
    await expect(assertBelongsToOrg('students', 's-org-b', 'org-a')).rejects.toThrow(
      ORG_SCOPE_VIOLATION
    )
    mockRows([])
    await expect(assertGroupBelongsToOrg('g-org-b', 'org-a')).rejects.toBeInstanceOf(OrgScopeError)
  })

  it('carries the table and ids on the error for logging', async () => {
    mockRows([])
    const err = await assertStudentsBelongToOrg(['s-org-b'], 'org-a').catch((e) => e)
    expect(err).toBeInstanceOf(OrgScopeError)
    expect(err.table).toBe('students')
    expect(err.ids).toEqual(['s-org-b'])
  })

  it('resolves silently when the row is in the org', async () => {
    mockRows([{ id: 's1' }])
    await expect(assertBelongsToOrg('students', 's1', 'org-a')).resolves.toBeUndefined()
  })
})
