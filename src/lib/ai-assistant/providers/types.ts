/**
 * AI provider adapter interface — Sprint 25.
 *
 * Each provider (OpenAI, Anthropic, Google) implements this interface.
 * The factory selects the correct adapter based on the org's config.
 */

export interface AiChatParams {
  systemPrompt: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  userMessage: string
  maxTokens?: number
  temperature?: number
}

export interface AiChatResult {
  content: string
  promptTokens: number
  completionTokens: number
}

export interface AiProvider {
  chat(params: AiChatParams): Promise<AiChatResult>
}

export type AiProviderName = 'openai' | 'anthropic' | 'google'
