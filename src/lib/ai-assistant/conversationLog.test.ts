/**
 * Unit tests for conversation log DB helpers.
 * Per /docs/sprint-20-scope.md § Story 5.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { appendTurn, countAssistantReplies, getRecentHistory } from './conversationLog'

// ── Query chain helper ─────────────────────────────────────────────────────────

/** Returns a fluent Supabase-like chain that resolves to `result` when awaited. */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  ;['select', 'eq', 'gte', 'order', 'limit', 'insert'].forEach(m => {
    chain[m] = () => chain
  })
  chain['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

// ── appendTurn() ──────────────────────────────────────────────────────────────

describe('appendTurn()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a single turn with the correct fields', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => ({ insert: mockInsert }),
    })

    await appendTurn('org-1', '+972501234567', 'parent-1', 'user', 'שאלה')

    expect(mockInsert).toHaveBeenCalledWith({
      organization_id: 'org-1',
      phone: '+972501234567',
      parent_id: 'parent-1',
      role: 'user',
      content: 'שאלה',
    })
  })

  it('works with null parentId', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => ({ insert: mockInsert }),
    })

    await appendTurn('org-1', '+972501234567', null, 'assistant', 'תשובה')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: null, role: 'assistant' })
    )
  })

  it('logs but does not throw when the DB insert fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockInsert = vi.fn().mockResolvedValue({ error: { message: 'db down' } })
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => ({ insert: mockInsert }),
    })

    await expect(
      appendTurn('org-1', '+972501234567', null, 'assistant', 'תשובה')
    ).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[conversation-log] appendTurn error',
      expect.objectContaining({ role: 'assistant' })
    )

    consoleErrorSpy.mockRestore()
  })
})

// ── countAssistantReplies() ───────────────────────────────────────────────────

describe('countAssistantReplies()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the count of assistant replies in the 24h window', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ count: 2, error: null }),
    })

    const count = await countAssistantReplies('org-1', '+972501234567')
    expect(count).toBe(2)
  })

  it('returns 0 when count is null', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ count: null, error: null }),
    })

    const count = await countAssistantReplies('org-1', '+972501234567')
    expect(count).toBe(0)
  })

  it('throws when the DB query fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ count: null, error: { message: 'db down' } }),
    })

    await expect(
      countAssistantReplies('org-1', '+972501234567')
    ).rejects.toThrow('Failed to count assistant replies')
  })
})

// ── getRecentHistory() ────────────────────────────────────────────────────────

describe('getRecentHistory()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns turns in ascending chronological order (reversed from DB descending order)', async () => {
    // DB returns newest-first; the function reverses to chronological order
    const dbData = [
      { role: 'assistant', content: 'תשובה' },
      { role: 'user', content: 'שאלה' },
    ]
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ data: dbData, error: null }),
    })

    const history = await getRecentHistory('org-1', '+972501234567')

    expect(history).toEqual([
      { role: 'user', content: 'שאלה' },
      { role: 'assistant', content: 'תשובה' },
    ])
  })

  it('returns empty array when data is null', async () => {
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ data: null, error: null }),
    })

    const history = await getRecentHistory('org-1', '+972501234567')
    expect(history).toEqual([])
  })

  it('returns empty array and logs on DB error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateServiceRoleClient.mockReturnValue({
      from: () => makeChain({ data: null, error: { message: 'db down' } }),
    })

    const history = await getRecentHistory('org-1', '+972501234567')
    expect(history).toEqual([])
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
