import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockChat = vi.fn()
const mockGetAiProvider = vi.fn()
const mockGetDebtorsOverview = vi.fn()
const mockLogAiUsage = vi.fn()

vi.mock('./providers/factory', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAiProvider: (orgId: string) => mockGetAiProvider(orgId),
}))

vi.mock('@/lib/charges/debtors', () => ({
  getDebtorsOverview: (orgId: string) => mockGetDebtorsOverview(orgId),
}))

vi.mock('./usage', () => ({
  logAiUsage: (params: unknown) => mockLogAiUsage(params),
}))

import { AiProviderNotConfiguredError } from './providers/factory'
import { askOwnerCopilot, classifyOwnerCopilotIntent, safeParseIntent } from './copilot'

const ORG_ID = '11111111-1111-1111-1111-111111111111'
const PARENT_ID = '22222222-2222-2222-2222-222222222222'

/** The bot string an owner sees when the copilot cannot do its job. */
const COPILOT_ERROR_HE = 'לא הצלחתי לטפל בזה כרגע 🙂 אפשר לנסות שוב או לכתוב "תפריט".'

function debtorRow(overrides: Record<string, unknown> = {}) {
  return {
    parentId: PARENT_ID,
    parentName: 'רותי כהן',
    optedOut: false,
    totalDebt: 400,
    oldestAgeDays: 30,
    ...overrides,
  }
}

function overview(rows: ReturnType<typeof debtorRow>[]) {
  return {
    rows,
    totalDebt: rows.reduce((sum, row) => sum + row.totalDebt, 0),
    debtorCount: rows.length,
  }
}

function chatResult(content: string) {
  return { content, promptTokens: 120, completionTokens: 20 }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAiProvider.mockResolvedValue({
    provider: { chat: mockChat },
    providerName: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
  })
  mockGetDebtorsOverview.mockResolvedValue(overview([debtorRow()]))
  mockLogAiUsage.mockResolvedValue('usage-id')
})

describe('classifyOwnerCopilotIntent', () => {
  it('parses a clean JSON action', async () => {
    mockChat.mockResolvedValue(chatResult('{"action":"send_debt_reminder_all"}'))

    await expect(classifyOwnerCopilotIntent(ORG_ID, 'תשלחי תזכורת לכולם')).resolves.toEqual({
      action: 'send_debt_reminder_all',
      params: {},
    })
  })

  it('parses an answer the model wrapped in a markdown fence', async () => {
    mockChat.mockResolvedValue(chatResult('```json\n{"action":"ask"}\n```'))

    await expect(classifyOwnerCopilotIntent(ORG_ID, 'כמה חייבים לי?')).resolves.toEqual({
      action: 'ask',
    })
  })

  it('falls back to unknown when the model answers off-schema', async () => {
    // Valid JSON, wrong shape — the message is not acted on, but the copilot
    // itself is healthy, so this is not the same as "unavailable".
    mockChat.mockResolvedValue(chatResult('{"action":"transfer_money"}'))

    await expect(classifyOwnerCopilotIntent(ORG_ID, 'שלח כסף')).resolves.toEqual({
      action: 'unknown',
    })
  })

  it('falls back to unknown when the model answers with prose', async () => {
    mockChat.mockResolvedValue(chatResult('Sure! I can help with that.'))

    await expect(classifyOwnerCopilotIntent(ORG_ID, 'משהו')).resolves.toEqual({
      action: 'unknown',
    })
  })

  it('downgrades cancel_session to unknown when nothing is pending', async () => {
    // The model may only cancel a proposal it was shown. Without one, a
    // cancel answer is it misreading the rules, not a real intent.
    mockChat.mockResolvedValue(chatResult('{"action":"cancel_session"}'))

    await expect(classifyOwnerCopilotIntent(ORG_ID, 'בטל')).resolves.toEqual({
      action: 'unknown',
    })
  })

  it('passes cancel_session through when a session is pending', async () => {
    mockChat.mockResolvedValue(chatResult('{"action":"cancel_session"}'))

    await expect(
      classifyOwnerCopilotIntent(ORG_ID, 'עזבי, בטלי את זה', {
        session: { action: 'send_debt_reminder_all', params: {} },
      })
    ).resolves.toEqual({ action: 'cancel_session' })
  })

  it('shows a pending proposal to the model', async () => {
    mockChat.mockResolvedValue(chatResult('{"action":"ask"}'))

    await classifyOwnerCopilotIntent(ORG_ID, 'לא, לרותי', {
      session: { action: 'send_debt_reminder_parent', params: { parentId: PARENT_ID } },
    })

    const { systemPrompt } = mockChat.mock.calls[0][0]
    expect(systemPrompt).toContain('Pending action')
    expect(systemPrompt).toContain('send_debt_reminder_parent')
    expect(systemPrompt).toContain(PARENT_ID)
  })

  it('returns null without calling the model when no AI is configured', async () => {
    // Null means "copilot unavailable" so the deterministic menu handlers answer
    // instead — an org with no AI key must never be left without a reply.
    mockGetAiProvider.mockRejectedValue(new AiProviderNotConfiguredError(ORG_ID, 'anthropic'))

    await expect(classifyOwnerCopilotIntent(ORG_ID, 'כמה חייבים לי?')).resolves.toBeNull()
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('returns null when the provider call fails', async () => {
    mockChat.mockRejectedValue(new Error('502 from provider'))

    await expect(classifyOwnerCopilotIntent(ORG_ID, 'כמה חייבים לי?')).resolves.toBeNull()
  })

  it('names the debtors in the prompt so a parent can be resolved by name', async () => {
    mockChat.mockResolvedValue(chatResult('{"action":"ask"}'))

    await classifyOwnerCopilotIntent(ORG_ID, 'תזכורת לרותי')

    const { systemPrompt } = mockChat.mock.calls[0][0]
    expect(systemPrompt).toContain('רותי כהן')
    expect(systemPrompt).toContain(PARENT_ID)
  })

  it('shows the model at most ten debtors', async () => {
    mockGetDebtorsOverview.mockResolvedValue(
      overview(
        Array.from({ length: 25 }, (_, i) =>
          debtorRow({ parentId: `parent-${i}`, parentName: `הורה ${i}` })
        )
      )
    )
    mockChat.mockResolvedValue(chatResult('{"action":"ask"}'))

    await classifyOwnerCopilotIntent(ORG_ID, 'תזכורת')

    const { systemPrompt } = mockChat.mock.calls[0][0]
    expect(systemPrompt).toContain('parent-9')
    expect(systemPrompt).not.toContain('parent-10')
  })

  it('still classifies when the debtors query fails', async () => {
    mockGetDebtorsOverview.mockRejectedValue(new Error('db down'))
    mockChat.mockResolvedValue(chatResult('{"action":"ask"}'))

    await expect(classifyOwnerCopilotIntent(ORG_ID, 'כמה חייבים לי?')).resolves.toEqual({
      action: 'ask',
    })
    expect(mockChat.mock.calls[0][0].systemPrompt).toContain('(none)')
  })

  it('logs usage so the copilot shows up in the org’s AI costs', async () => {
    mockChat.mockResolvedValue(chatResult('{"action":"ask"}'))

    await classifyOwnerCopilotIntent(ORG_ID, 'כמה חייבים לי?', { actorPhone: '+972500000000' })

    expect(mockLogAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        promptTokens: 120,
        completionTokens: 20,
        source: 'owner_copilot',
        actorPhone: '+972500000000',
      })
    )
  })

  it('logs no usage when the call never happened', async () => {
    mockGetAiProvider.mockRejectedValue(new AiProviderNotConfiguredError(ORG_ID, 'anthropic'))

    await classifyOwnerCopilotIntent(ORG_ID, 'כמה חייבים לי?')

    expect(mockLogAiUsage).not.toHaveBeenCalled()
  })
})

describe('askOwnerCopilot', () => {
  it('returns the model’s answer and logs the usage', async () => {
    mockChat.mockResolvedValue(chatResult('יש לך 400₪ חוב פתוח מהורה אחד.'))

    await expect(askOwnerCopilot(ORG_ID, 'כמה חייבים לי?')).resolves.toBe(
      'יש לך 400₪ חוב פתוח מהורה אחד.'
    )
    expect(mockLogAiUsage).toHaveBeenCalledTimes(1)
  })

  it('pins the answer language to the owner’s locale', async () => {
    mockChat.mockResolvedValue(chatResult('You have 400₪ outstanding.'))

    await askOwnerCopilot(ORG_ID, 'how much am I owed?', 'en')

    expect(mockChat.mock.calls[0][0].systemPrompt).toContain('English')
  })

  it('apologises instead of throwing when no AI is configured', async () => {
    // Throwing here would leave the owner with silence and Meta redelivering
    // the message into the same failure.
    mockGetAiProvider.mockRejectedValue(new AiProviderNotConfiguredError(ORG_ID, 'anthropic'))

    await expect(askOwnerCopilot(ORG_ID, 'כמה חייבים לי?')).resolves.toBe(COPILOT_ERROR_HE)
  })

  it('apologises when the debtors query fails', async () => {
    mockGetDebtorsOverview.mockRejectedValue(new Error('db down'))

    await expect(askOwnerCopilot(ORG_ID, 'כמה חייבים לי?')).resolves.toBe(COPILOT_ERROR_HE)
    expect(mockChat).not.toHaveBeenCalled()
  })

  it('apologises when the provider call fails', async () => {
    mockChat.mockRejectedValue(new Error('timeout'))

    await expect(askOwnerCopilot(ORG_ID, 'כמה חייבים לי?')).resolves.toBe(COPILOT_ERROR_HE)
  })

  it('apologises when the model returns nothing', async () => {
    mockChat.mockResolvedValue(chatResult(''))

    await expect(askOwnerCopilot(ORG_ID, 'כמה חייבים לי?')).resolves.toBe(COPILOT_ERROR_HE)
  })
})

describe('safeParseIntent', () => {
  it('parses every action the classifier may return', () => {
    expect(safeParseIntent('{"action":"ask"}')).toEqual({ action: 'ask' })
    expect(safeParseIntent('{"action":"unknown"}')).toEqual({ action: 'unknown' })
    expect(safeParseIntent('{"action":"cancel_session"}')).toEqual({ action: 'cancel_session' })
    expect(safeParseIntent('{"action":"send_debt_reminder_all","params":{}}')).toEqual({
      action: 'send_debt_reminder_all',
      params: {},
    })
    expect(
      safeParseIntent('{"action":"send_debt_reminder_parent","params":{"parentId":"abc"}}')
    ).toEqual({ action: 'send_debt_reminder_parent', params: { parentId: 'abc' } })
  })

  it('normalises the legacy top-level parentId into params', () => {
    // A model still latched onto the pre-session prompt shape must not fail
    // the parse — its output means the same thing.
    expect(safeParseIntent('{"action":"send_debt_reminder_parent","parentId":"abc"}')).toEqual({
      action: 'send_debt_reminder_parent',
      params: { parentId: 'abc' },
    })
  })

  it('defaults missing params to an empty object', () => {
    expect(safeParseIntent('{"action":"send_debt_reminder_all"}')).toEqual({
      action: 'send_debt_reminder_all',
      params: {},
    })
    expect(safeParseIntent('{"action":"send_debt_reminder_parent"}')).toEqual({
      action: 'send_debt_reminder_parent',
      params: {},
    })
  })

  it('returns null for anything off-schema', () => {
    expect(safeParseIntent('')).toBeNull()
    expect(safeParseIntent('not json')).toBeNull()
    expect(safeParseIntent('{"action":"launch_missiles"}')).toBeNull()
    expect(safeParseIntent('{"params":{"parentId":"abc"}}')).toBeNull()
    expect(safeParseIntent('{"action":42}')).toBeNull()
  })
})
