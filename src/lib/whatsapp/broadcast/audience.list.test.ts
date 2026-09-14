import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { resolveAudience } from './audience'

/**
 * A saved list resolves its members at send time and then runs through the
 * same consent rules as every other audience. These tests pin both halves:
 * membership comes from broadcast_list_members, and an opted-out member is
 * counted as skipped rather than messaged.
 */

type Calls = { table: string; filters: Array<[string, unknown]> }[]

function mockDb(tables: Record<string, unknown[]>, calls: Calls = []) {
  mockCreateServiceRoleClient.mockReturnValue({
    from: (table: string) => {
      const entry = { table, filters: [] as Array<[string, unknown]> }
      calls.push(entry)
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'order', 'limit', 'not', 'neq']) chain[method] = () => chain
      chain.eq = (col: string, val: unknown) => {
        entry.filters.push([col, val])
        return chain
      }
      chain.in = (col: string, val: unknown) => {
        entry.filters.push([col, val])
        return chain
      }
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve)
      return chain
    },
  })
}

const parent = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  full_name: 'רות לוי',
  phone: '+972500000001',
  preferred_locale: 'he',
  is_active: true,
  opted_out_at: null,
  updates_opted_out_at: null,
  marketing_opt_in_at: null,
  marketing_opted_out_at: null,
  ...over,
})

describe("resolveAudience({ kind: 'list' })", () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the members of that list, scoped to the org', async () => {
    const calls: Calls = []
    mockDb(
      {
        broadcast_list_members: [{ parent_id: 'p1' }, { parent_id: 'p2' }],
        parents: [parent(), parent({ id: 'p2', phone: '+972500000002', full_name: 'דני' })],
      },
      calls
    )

    const result = await resolveAudience('org-1', { kind: 'list', listId: 'list-1' }, 'class_update')

    expect(result.included.map((r) => r.parentId).sort()).toEqual(['p1', 'p2'])
    const memberRead = calls.find((c) => c.table === 'broadcast_list_members')
    expect(memberRead?.filters).toContainEqual(['organization_id', 'org-1'])
    expect(memberRead?.filters).toContainEqual(['list_id', 'list-1'])
  })

  it('skips a member who opted out, exactly as any other audience would', async () => {
    mockDb({
      broadcast_list_members: [{ parent_id: 'p1' }, { parent_id: 'p2' }],
      parents: [
        parent(),
        parent({ id: 'p2', phone: '+972500000002', opted_out_at: '2026-09-01T00:00:00Z' }),
      ],
    })

    const result = await resolveAudience('org-1', { kind: 'list', listId: 'list-1' }, 'class_update')

    expect(result.included.map((r) => r.parentId)).toEqual(['p1'])
    expect(result.skipped).toContainEqual({ reason: 'opted_out', count: 1 })
  })

  it('reaches nobody when the list is empty, without reading parents', async () => {
    const calls: Calls = []
    mockDb({ broadcast_list_members: [] }, calls)

    const result = await resolveAudience('org-1', { kind: 'list', listId: 'list-1' }, 'class_update')

    expect(result).toEqual({ included: [], skipped: [] })
    expect(calls.some((c) => c.table === 'parents')).toBe(false)
  })
})
