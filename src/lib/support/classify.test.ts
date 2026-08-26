/**
 * Unit tests for AI ticket triage — Sprint 32 M2.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockChat, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockChat: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/ai-assistant/providers/openai', () => ({
  OpenAiProvider: class {
    chat = mockChat
  },
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

import { classifyTicket, classifyAndStore } from './classify'

const ORIGINAL_KEY = process.env.OPENAI_API_KEY

beforeEach(() => {
  vi.clearAllMocks()
  process.env.OPENAI_API_KEY = 'test-key'
})

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY
})

function chainReturning(result: unknown) {
  const chain: Record<string, unknown> = {}
  ;['update', 'eq'].forEach((m) => {
    chain[m] = () => chain
  })
  chain['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

// ── classifyTicket() ──────────────────────────────────────────────────────────

describe('classifyTicket()', () => {
  it('parses a clean JSON reply', async () => {
    mockChat.mockResolvedValue({ content: '{"category":"bug","severity":"critical"}' })

    await expect(classifyTicket('cannot charge', 'payments fail')).resolves.toEqual({
      category: 'bug',
      severity: 'critical',
    })
  })

  it('tolerates a markdown-fenced reply', async () => {
    mockChat.mockResolvedValue({
      content: '```json\n{"category":"question","severity":"low"}\n```',
    })

    await expect(classifyTicket('how do I', 'add a student?')).resolves.toEqual({
      category: 'question',
      severity: 'low',
    })
  })

  it('returns null when the platform key is unset, without calling the model', async () => {
    delete process.env.OPENAI_API_KEY

    await expect(classifyTicket('s', 'b')).resolves.toBeNull()
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('returns null on a value outside the allowed enums', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockChat.mockResolvedValue({ content: '{"category":"urgent","severity":"catastrophic"}' })

    await expect(classifyTicket('s', 'b')).resolves.toBeNull()
  })

  it('returns null on unparseable output rather than throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockChat.mockResolvedValue({ content: 'I think this is a bug, probably.' })

    await expect(classifyTicket('s', 'b')).resolves.toBeNull()
  })

  it('returns null when the provider throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockChat.mockRejectedValue(new Error('rate limited'))

    await expect(classifyTicket('s', 'b')).resolves.toBeNull()
  })

  it('caps the prompt so a pasted stack trace cannot blow up the request', async () => {
    mockChat.mockResolvedValue({ content: '{"category":"bug","severity":"low"}' })

    await classifyTicket('subject', 'x'.repeat(10_000))

    const { userMessage } = mockChat.mock.calls[0][0]
    expect(userMessage.length).toBeLessThanOrEqual(4000)
  })
})

// ── classifyAndStore() ────────────────────────────────────────────────────────

describe('classifyAndStore()', () => {
  it('persists the classification and stamps ai_classified_at', async () => {
    mockChat.mockResolvedValue({ content: '{"category":"bug","severity":"high"}' })
    const update = vi.fn().mockReturnValue(chainReturning({ error: null }))
    mockCreateServiceRoleClient.mockReturnValue({ from: () => ({ update }) })

    await expect(classifyAndStore('t1', 's', 'b')).resolves.toEqual({
      category: 'bug',
      severity: 'high',
    })
    expect(update).toHaveBeenCalledWith({
      category: 'bug',
      severity: 'high',
      ai_classified_at: expect.any(String),
    })
  })

  it('does not touch the ticket when classification failed', async () => {
    delete process.env.OPENAI_API_KEY
    const update = vi.fn()
    mockCreateServiceRoleClient.mockReturnValue({ from: () => ({ update }) })

    await expect(classifyAndStore('t1', 's', 'b')).resolves.toBeNull()
    expect(update).not.toHaveBeenCalled()
  })
})
