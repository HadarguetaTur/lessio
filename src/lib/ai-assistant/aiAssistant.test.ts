/**
 * Unit tests for aiAssistant() — safety cap and error fallback.
 * Per /docs/sprint-19-scope.md § Test Plan — automated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { aiAssistant, HUMAN_REDIRECT_MESSAGE } from './index'

// ── Mock dependencies ─────────────────────────────────────────────────────────

vi.mock('./conversationLog', () => ({
  countAssistantReplies: vi.fn(),
  getRecentHistory: vi.fn().mockResolvedValue([]),
}))

vi.mock('./buildSystemPrompt', () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue('You are a helpful assistant.'),
}))

const mockCreate = vi.fn()

vi.mock('openai', () => {
  class MockAPIError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'APIError'
      this.status = status
    }
  }

  return {
    default: class MockOpenAI {
      chat = { completions: { create: mockCreate } }
      static APIError = MockAPIError
    },
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('aiAssistant()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OPENAI_API_KEY = 'test-openai-key'
  })

  it('returns human-redirect when safety cap (≥3 replies) is reached', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(3)

    const result = await aiAssistant('org-1', '+972501234567', null, 'שאלה כלשהי')

    expect(result).toBe(HUMAN_REDIRECT_MESSAGE)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns human-redirect when count is above cap', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(10)

    const result = await aiAssistant('org-1', '+972501234567', null, 'עוד שאלה')

    expect(result).toBe(HUMAN_REDIRECT_MESSAGE)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('calls OpenAI and returns the reply when under cap', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(1)

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'השיעור הבא ביום שני בשעה 16:00' } }],
      usage: { prompt_tokens: 50, completion_tokens: 20 },
      model: 'gpt-4o-mini',
    })

    const result = await aiAssistant('org-1', '+972501234567', 'parent-1', 'מתי השיעור?')

    expect(result).toBe('השיעור הבא ביום שני בשעה 16:00')
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('falls back to HUMAN_REDIRECT_MESSAGE when OpenAI returns empty content', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(0)

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 0 },
      model: 'gpt-4o-mini',
    })

    const result = await aiAssistant('org-1', '+972501234567', null, 'שאלה')

    expect(result).toBe(HUMAN_REDIRECT_MESSAGE)
  })

  it('returns human-redirect when the safety-cap lookup fails', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockRejectedValue(new Error('db down'))

    const result = await aiAssistant('org-1', '+972501234567', 'parent-2', 'שאלה')

    expect(result).toBe(HUMAN_REDIRECT_MESSAGE)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('still returns the OpenAI reply without writing logs directly', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(2)

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'תשובה' } }],
      usage: { prompt_tokens: 40, completion_tokens: 10 },
      model: 'gpt-4o-mini',
    })

    const result = await aiAssistant('org-1', '+972501234567', 'parent-2', 'שאלה')
    expect(result).toBe('תשובה')
  })

  it('rethrows when the OpenAI request fails', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(1)
    mockCreate.mockRejectedValue(new Error('openai down'))

    await expect(
      aiAssistant('org-1', '+972501234567', 'parent-1', 'שאלה')
    ).rejects.toThrow('openai down')
  })

  it('logs the HTTP status when OpenAI throws an APIError and rethrows', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(1)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { default: MockOpenAI } = await import('openai')
    type WithAPIError = { APIError: new (m: string, s: number) => Error }
    const apiError = new (MockOpenAI as unknown as WithAPIError).APIError('rate limited', 429)
    mockCreate.mockRejectedValue(apiError)

    await expect(
      aiAssistant('org-1', '+972501234567', null, 'שאלה')
    ).rejects.toThrow()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[ai-assistant] OpenAI API error',
      expect.objectContaining({ status: 429 })
    )

    consoleSpy.mockRestore()
  })
})
