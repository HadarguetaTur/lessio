/**
 * Google Gemini adapter — Sprint 25.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AiProvider, AiChatParams, AiChatResult } from './types'

export class GoogleProvider implements AiProvider {
  private genAI: GoogleGenerativeAI
  private model: string

  constructor(apiKey: string, model: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = model
  }

  async chat(params: AiChatParams): Promise<AiChatResult> {
    const { systemPrompt, history, userMessage, maxTokens = 300, temperature = 0.3 } = params

    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    })

    const chat = model.startChat({
      history: history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
    })

    const result = await chat.sendMessage(userMessage)
    const response = result.response

    return {
      content: response.text()?.trim() ?? '',
      promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    }
  }
}
