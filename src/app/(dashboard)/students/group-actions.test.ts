/**
 * Cross-tenant regression tests for the student-group actions.
 *
 * These four actions take a group id positionally from the client and write
 * through a service-role client. Before this suite they filtered on `id` alone,
 * so an owner of org A could rename, pause, or delete a group belonging to
 * org B — and because `student_group_members` cascades on delete, a wiped
 * roster silently re-prices the victim's next monthly bill (group membership
 * feeds `price_per_student` in the billing engine).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockRequireMutation,
  mockCreateServiceRoleClient,
  mockIdsBelongToOrg,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMutation: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockIdsBelongToOrg: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
  requireMutation: mockRequireMutation,
  SUPPORT_MODE_READ_ONLY: 'SUPPORT_MODE_READ_ONLY',
  SAAS_READ_ONLY: 'SAAS_READ_ONLY',
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))
vi.mock('@/lib/auth/orgScope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/orgScope')>()
  return { ...actual, idsBelongToOrg: mockIdsBelongToOrg }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((k: string) => k),
}))
vi.mock('@/lib/i18n/actionErrors', () => ({
  commonError: vi.fn().mockResolvedValue('noPermission'),
  zodError: vi.fn().mockResolvedValue('invalidData'),
}))

import { deleteGroup, toggleGroupStatus, updateGroup } from './group-actions'

/** Every write the action attempted, so a leaked mutation is visible. */
let writes: { table: string; op: string; filters: Record<string, unknown> }[] = []

function mockDb() {
  writes = []
  const chain = (table: string, op: string) => {
    const filters: Record<string, unknown> = {}
    const node: Record<string, unknown> = {}
    const eq = (col: string, val: unknown) => {
      filters[col] = val
      return node
    }
    node.eq = vi.fn(eq)
    node.select = vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'g1' }, error: null }) })
    node.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
    writes.push({ table, op, filters })
    return node
  }
  mockCreateServiceRoleClient.mockReturnValue({
    from: (table: string) => ({
      insert: () => chain(table, 'insert'),
      update: () => chain(table, 'update'),
      delete: () => chain(table, 'delete'),
    }),
  })
}

const ORG_A = { orgId: 'org-a', role: 'owner', profileId: 'p1', userId: 'p1', fullName: 'A' }

function formData(): FormData {
  const fd = new FormData()
  fd.set('name', 'Renamed by attacker')
  fd.set('status', 'active')
  fd.append('student_ids', '11111111-1111-4111-8111-111111111111')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb()
  mockGetSession.mockResolvedValue(ORG_A)
  mockRequireMutation.mockReturnValue(undefined)
  mockIdsBelongToOrg.mockResolvedValue(true)
})

describe('cross-tenant group access', () => {
  it('org A cannot update org B\'s group', async () => {
    // The group is not in org A, so the ownership lookup finds nothing.
    mockIdsBelongToOrg.mockImplementation(async (table: string) => table !== 'student_groups')

    const result = await updateGroup('group-of-org-b', null, formData())

    expect(result).toEqual({ error: 'noPermission' })
    expect(writes.filter((w) => w.op !== 'insert' || w.table !== 'x')).toEqual([])
  })

  it("org A cannot delete org B's group — the victim's roster stays intact", async () => {
    mockIdsBelongToOrg.mockImplementation(async (table: string) => table !== 'student_groups')

    const result = await deleteGroup('group-of-org-b')

    expect(result).toEqual({ error: 'noPermission' })
    // No delete reached student_groups, so the ON DELETE CASCADE that would
    // have wiped student_group_members never fired.
    expect(writes).toEqual([])
  })

  it("org A cannot toggle org B's group status", async () => {
    mockIdsBelongToOrg.mockImplementation(async (table: string) => table !== 'student_groups')

    const result = await toggleGroupStatus('group-of-org-b', 'active')

    expect(result).toEqual({ error: 'noPermission' })
    expect(writes).toEqual([])
  })

  it('scopes every write to the session org when the group is genuinely owned', async () => {
    await expect(deleteGroup('g1')).resolves.toBeNull()
    expect(writes).toHaveLength(1)
    expect(writes[0].table).toBe('student_groups')
    expect(writes[0].filters).toMatchObject({ id: 'g1', organization_id: 'org-a' })
  })

  it('refuses a roster containing another org\'s student', async () => {
    mockIdsBelongToOrg.mockImplementation(async (table: string) => table !== 'students')

    const result = await updateGroup('g1', null, formData())

    expect(result).toEqual({ error: 'noPermission' })
    expect(writes).toEqual([])
  })
})

describe('mutation guard', () => {
  it.each([
    ['support-mode', 'SUPPORT_MODE_READ_ONLY'],
    ['lapsed subscription', 'SAAS_READ_ONLY'],
  ])('refuses a write in %s', async (_label, code) => {
    mockRequireMutation.mockImplementation(() => {
      throw new Error(code)
    })

    await expect(deleteGroup('g1')).resolves.toEqual({ error: 'noPermission' })
    await expect(toggleGroupStatus('g1', 'active')).resolves.toEqual({ error: 'noPermission' })
    await expect(updateGroup('g1', null, formData())).resolves.toEqual({ error: 'noPermission' })
    expect(writes).toEqual([])
  })
})

describe('role guard still holds', () => {
  it('refuses a teacher calling the action directly, with no UI involved', async () => {
    mockGetSession.mockResolvedValue({ ...ORG_A, role: 'teacher' })

    await expect(deleteGroup('g1')).resolves.toEqual({ error: 'noPermission' })
    expect(writes).toEqual([])
  })
})
