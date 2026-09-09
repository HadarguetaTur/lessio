/**
 * SUPPORT-03: the order of destruction.
 *
 * Storage used to be wiped before the database transaction. When the RPC then
 * failed — its "no progress" guard trips on any table carrying organization_id
 * without a usable FK ordering — the tenant survived with every file it had
 * ever stored irrecoverably gone, and there is no per-tenant restore to go to.
 *
 * These tests pin the order and the failure semantics, because both are
 * invisible in the happy path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []

const removeMock = vi.fn()

function removeSucceeds() {
  removeMock.mockImplementation(async () => {
    calls.push('storage.remove')
    return { error: null }
  })
}

const mockDb = {
  from: vi.fn(),
  rpc: vi.fn(),
  storage: { from: vi.fn(() => ({ remove: removeMock })) },
  auth: { admin: { deleteUser: vi.fn(async () => ({ error: null })) } },
}

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => mockDb,
}))

vi.mock('./exportOrgData', () => ({
  buildOrgDataExport: vi.fn(async (orgId: string) => {
    calls.push('snapshot')
    return { exported_at: 'now', org_id: orgId, parents: [], students: [], lessons: [], charges: [] }
  }),
}))

import { deleteOrganizationCompletely, OrganizationDeleteError } from './deleteOrganization'
import { buildOrgDataExport } from './exportOrgData'

const ORG = { id: 'org-1', name: 'Studio', slug: 'studio' }

function chain(result: unknown) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn(() => c)
  c.eq = vi.fn(() => c)
  c.maybeSingle = vi.fn(async () => result)
  // profiles: `.select().eq()` is awaited directly
  c.then = undefined
  return c
}

function setupTables(profiles: { id: string }[] = [{ id: 'user-1' }]) {
  mockDb.from.mockImplementation((table: string) => {
    if (table === 'organizations') return chain({ data: ORG, error: null })
    if (table === 'profiles') {
      const c: Record<string, unknown> = {}
      c.select = vi.fn(() => c)
      c.eq = vi.fn(async () => ({ data: profiles, error: null }))
      return c
    }
    return chain({ data: null, error: null })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  removeSucceeds()
  mockDb.storage.from.mockReturnValue({ remove: removeMock })
})

describe('deleteOrganizationCompletely', () => {
  it('snapshots, then deletes rows, then deletes files', async () => {
    setupTables()
    mockDb.rpc.mockImplementation(async (fn: string) => {
      calls.push(fn)
      if (fn === 'list_organization_storage_objects') {
        return { data: [{ bucket_id: 'exam-files', name: 'org-1/a.pdf' }], error: null }
      }
      return { data: { deleted: { students: 3 } }, error: null }
    })

    const result = await deleteOrganizationCompletely({ orgId: 'org-1', confirmation: 'studio' })

    expect(calls).toEqual([
      'snapshot',
      'delete_organization_completely',
      'list_organization_storage_objects',
      'storage.remove',
    ])
    expect(result.storageObjectsRemoved).toBe(1)
    expect(result.snapshot).not.toBeNull()
  })

  /** The regression. A failed RPC must leave the tenant's files untouched. */
  it('leaves every file in place when the database transaction fails', async () => {
    setupTables()
    mockDb.rpc.mockImplementation(async (fn: string) => {
      calls.push(fn)
      if (fn === 'delete_organization_completely') {
        return { data: null, error: { message: 'no progress deleting organization rows' } }
      }
      return { data: [], error: null }
    })

    await expect(
      deleteOrganizationCompletely({ orgId: 'org-1', confirmation: 'studio' })
    ).rejects.toThrow(OrganizationDeleteError)

    expect(calls).not.toContain('list_organization_storage_objects')
    expect(removeMock).not.toHaveBeenCalled()
  })

  /**
   * The mirror case: once the rows are gone the tenant IS deleted. Reporting a
   * storage failure as a thrown error would tell the operator the deletion
   * failed while the org no longer exists.
   */
  it('reports orphaned files instead of failing when storage errors after the rows are gone', async () => {
    setupTables()
    mockDb.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'list_organization_storage_objects') {
        return { data: [{ bucket_id: 'exam-files', name: 'org-1/a.pdf' }], error: null }
      }
      return { data: { deleted: { students: 3 } }, error: null }
    })
    removeMock.mockResolvedValue({ error: { message: 'bucket unavailable' } })

    const result = await deleteOrganizationCompletely({ orgId: 'org-1', confirmation: 'studio' })

    expect(result.storageObjectsFailed).toBe(1)
    expect(result.storageObjectsRemoved).toBe(0)
  })

  it('proceeds without a snapshot rather than blocking the delete, and says so', async () => {
    setupTables()
    vi.mocked(buildOrgDataExport).mockRejectedValueOnce(new Error('export failed'))
    mockDb.rpc.mockImplementation(async (fn: string) =>
      fn === 'list_organization_storage_objects'
        ? { data: [], error: null }
        : { data: { deleted: {} }, error: null }
    )

    const result = await deleteOrganizationCompletely({ orgId: 'org-1', confirmation: 'studio' })
    expect(result.snapshot).toBeNull()
  })

  it('refuses a mismatched slug before touching anything', async () => {
    setupTables()
    await expect(
      deleteOrganizationCompletely({ orgId: 'org-1', confirmation: 'wrong' })
    ).rejects.toMatchObject({ code: 'confirmation_mismatch' })

    expect(mockDb.rpc).not.toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()
  })
})
