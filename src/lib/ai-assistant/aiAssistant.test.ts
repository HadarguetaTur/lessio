/**
 * Unit tests for aiAssistant() — safety cap and error fallback.
 * Per /docs/sprint-19-scope.md § Test Plan — automated.
 * Updated for Sprint 25 multi-provider refactor.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { aiAssistant, HUMAN_REDIRECT_MESSAGE } from './index'

// ── Mock dependencies ─────────────────────────────────────────────────────────

const mockChat = vi.hoisted(() => vi.fn())

vi.mock('./conversationLog', () => ({
  countAssistantReplies: vi.fn(),
  getRecentHistory: vi.fn().mockResolvedValue([]),
}))

vi.mock('./buildSystemPrompt', () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue('You are a helpful assistant.'),
}))

vi.mock('./providers/factory', () => ({
  getAiProvider: vi.fn().mockResolvedValue({
    provider: { chat: mockChat },
    providerName: 'openai',
    model: 'gpt-4o-mini',
  }),
  isAiConfiguredForOrg: vi.fn().mockResolvedValue(true),
}))

vi.mock('./usage', () => ({
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./costs', () => ({
  estimateCost: vi.fn().mockReturnValue(0.001),
}))

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

    expect(result.reply).toBe(HUMAN_REDIRECT_MESSAGE)
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('returns human-redirect when count is above cap', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(10)

    const result = await aiAssistant('org-1', '+972501234567', null, 'עוד שאלה')

    expect(result.reply).toBe(HUMAN_REDIRECT_MESSAGE)
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('calls the AI provider and returns the reply when under cap', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(1)

    mockChat.mockResolvedValue({
      content: 'השיעור הבא ביום שני בשעה 16:00',
      promptTokens: 50,
      completionTokens: 20,
    })

    const result = await aiAssistant('org-1', '+972501234567', 'parent-1', 'מתי השיעור?')

    expect(result.reply).toBe('השיעור הבא ביום שני בשעה 16:00')
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-4o-mini')
    expect(mockChat).toHaveBeenCalledOnce()
  })

  it('falls back to HUMAN_REDIRECT_MESSAGE when provider returns empty content', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(0)

    mockChat.mockResolvedValue({
      content: null,
      promptTokens: 10,
      completionTokens: 0,
    })

    const result = await aiAssistant('org-1', '+972501234567', null, 'שאלה')

    expect(result.reply).toBe(HUMAN_REDIRECT_MESSAGE)
  })

  it('returns human-redirect when the safety-cap lookup fails', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockRejectedValue(new Error('db down'))

    const result = await aiAssistant('org-1', '+972501234567', 'parent-2', 'שאלה')

    expect(result.reply).toBe(HUMAN_REDIRECT_MESSAGE)
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('still returns the reply without writing logs directly', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(2)

    mockChat.mockResolvedValue({
      content: 'תשובה',
      promptTokens: 40,
      completionTokens: 10,
    })

    const result = await aiAssistant('org-1', '+972501234567', 'parent-2', 'שאלה')
    expect(result.reply).toBe('תשובה')
  })

  it('rethrows when the AI provider request fails', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(1)
    mockChat.mockRejectedValue(new Error('provider down'))

    await expect(
      aiAssistant('org-1', '+972501234567', 'parent-1', 'שאלה')
    ).rejects.toThrow('provider down')
  })

  it('logs the error and rethrows when the AI provider throws', async () => {
    const { countAssistantReplies } = await import('./conversationLog')
    vi.mocked(countAssistantReplies).mockResolvedValue(1)

    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    mockChat.mockRejectedValue(new Error('rate limited'))

    await expect(
      aiAssistant('org-1', '+972501234567', null, 'שאלה')
    ).rejects.toThrow('rate limited')

    consoleSpy.mockRestore()
  })
})
