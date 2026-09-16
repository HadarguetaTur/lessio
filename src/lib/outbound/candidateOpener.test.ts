import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const chat = vi.hoisted(() => vi.fn())
vi.mock('@/lib/ai-assistant/providers/openai', () => ({ OpenAiProvider: class { chat = chat } }))
import { generateCandidateOpener, renderFactOpener } from './candidateOpener'
import { extractResearchFacts } from './discoveryResearch'
const facts = extractResearchFacts('מרכז למידה עם צוות מורים בקבוצות קטנות', 'https://tutor.test')
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('OPENAI_API_KEY', 'test') })
afterEach(() => vi.unstubAllEnvs())
describe('grounded candidate opener', () => {
  it('renders only provided fact values and supplies structured evidence to the model', async () => {
    chat.mockResolvedValue({ content: '{"factIds":[0,2]}' })
    const result = await generateCandidateOpener(facts)
    expect(result).toEqual({ ok: true, factIds: [0, 2], text: renderFactOpener(facts, [0, 2]) })
    const input = JSON.parse(chat.mock.calls[0]![0].userMessage)
    expect(input.facts[0]).toMatchObject({ id: 0, quote: expect.any(String), sourceUrl: 'https://tutor.test' })
  })
  it.each(['{"factIds":[99]}', '{"factIds":[0,0]}', '{"factIds":["0"]}', '{"text":"invented business claim"}', 'hi'])('rejects ungrounded output %s', async (content) => {
    chat.mockResolvedValue({ content })
    expect((await generateCandidateOpener(facts)).ok).toBe(false)
  })
  it('does not call the model with insufficient facts or a missing key', async () => {
    expect(await generateCandidateOpener([])).toEqual({ ok: false, error: 'INSUFFICIENT_FACTS' })
    vi.stubEnv('OPENAI_API_KEY', '')
    expect(await generateCandidateOpener(facts)).toEqual({ ok: false, error: 'NO_API_KEY' })
    expect(chat).not.toHaveBeenCalled()
  })
  it.each([[401, 'MODEL_AUTH'], [429, 'MODEL_RATE_LIMIT'], [503, 'MODEL_UNAVAILABLE']])('records a useful error for status %s', async (status, error) => {
    chat.mockRejectedValue({ status, message: 'provider message with sensitive data' })
    expect(await generateCandidateOpener(facts)).toEqual({ ok: false, error })
  })
})
