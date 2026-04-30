/**
 * OpenAI adapter — Sprint 25.
 * Extracted from src/lib/ai-assistant/index.ts (Sprint 19).
 */

import OpenAI from 'openai'
import type { AiProvider, AiChatParams, AiChatResult } from './types'

const TIMEOUT_MS = 8_000
const MAX_RETRIES = 1

export class OpenAiProvider implements AiProvider {
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({
      apiKey,
      timeout: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    })
    this.model = model
  }

  async chat(params: AiChatParams): Promise<AiChatResult> {
    const { systemPrompt, history, userMessage, maxTokens = 300, temperature = 0.3 } = params

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature,
      })

      return {
        content: response.choices[0]?.message?.content?.trim() ?? '',
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      }
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        console.error('[ai/openai] API error', {
          status: err.status,
          message: err.message,
        })
      }
      throw err
    }
  }
}
