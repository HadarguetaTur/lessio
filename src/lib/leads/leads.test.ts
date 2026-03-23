import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock Supabase service-role client ─────────────────────────────────────────

const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      insert: mockInsert,
      update: mockUpdate,
    }),
  }),
}))

import { upsertLead } from './index'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUpdateChain(error: unknown = null) {
  const chain: Record<string, unknown> = {}
  chain['eq'] = () => chain
  chain['then'] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ error }).then(resolve)
  // Support await directly
  return { eq: () => makeEqChain(error) }
}

function makeEqChain(error: unknown = null) {
  const self: Record<string, unknown> = {}
  self['eq'] = () => makeEqChain(error)
  // awaitable
  Object.defineProperty(self, Symbol.toStringTag, { value: 'Promise' })
  self['then'] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ error }).then(resolve)
  return self
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('upsertLead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a new lead on first contact', async () => {
    mockInsert.mockResolvedValue({ error: null })

    await upsertLead('org-1', '+972501234567', 'שלום')

    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockInsert).toHaveBeenCalledWith({
      organization_id: 'org-1',
      phone: '+972501234567',
      raw_message: 'שלום',
    })
  })

  it('does not create a duplicate — updates updated_at only on second message from same phone', async () => {
    // First call: insert succeeds
    mockInsert.mockResolvedValueOnce({ error: null })
    await upsertLead('org-1', '+972501234567', 'ראשון')
    expect(mockInsert).toHaveBeenCalledOnce()

    vi.clearAllMocks()

    // Second call: insert returns 23505 conflict
    mockInsert.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })
    mockUpdate.mockReturnValue({
      eq: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    })

    await upsertLead('org-1', '+972501234567', 'שני')

    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockUpdate).toHaveBeenCalledOnce()
    // Must only update updated_at — not status, notes, or raw_message
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updated_at: expect.any(String) })
    )
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.anything() })
    )
  })

  it('throws on unexpected DB error during insert', async () => {
    mockInsert.mockResolvedValue({
      error: { code: '42501', message: 'permission denied' },
    })

    await expect(upsertLead('org-1', '+972501234567', 'test')).rejects.toThrow(
      '[upsertLead] Failed to insert lead'
    )
  })

  it('throws when update after conflict fails', async () => {
    mockInsert.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key' },
    })
    mockUpdate.mockReturnValue({
      eq: () => ({
        eq: () => Promise.resolve({ error: { code: '42501', message: 'permission denied' } }),
      }),
    })

    await expect(upsertLead('org-1', '+972501234567', 'test')).rejects.toThrow(
      '[upsertLead] Failed to update lead updated_at'
    )
  })
})
