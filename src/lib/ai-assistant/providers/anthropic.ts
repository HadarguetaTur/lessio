/**
 * Anthropic adapter — Sprint 25.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AiProvider, AiChatParams, AiChatResult } from './types'

const TIMEOUT_MS = 8_000
const MAX_RETRIES = 1

export class AnthropicProvider implements AiProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({
      apiKey,
      timeout: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    })
    this.model = model
  }

  async chat(params: AiChatParams): Promise<AiChatResult> {
    const { systemPrompt, history, userMessage, maxTokens = 300, temperature = 0.3 } = params

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [
          ...history.map(h => ({
            role: h.role as 'user' | 'assistant',
            content: h.content,
          })),
          { role: 'user', content: userMessage },
        ],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      return {
        content: textBlock?.text?.trim() ?? '',
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      }
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        console.error('[ai/anthropic] API error', {
          status: err.status,
          message: err.message,
        })
      }
      throw err
    }
  }
}
