/**
 * AI WhatsApp assistant.
 * Enforces a 3-reply-per-24h safety cap, builds a context-rich Hebrew system
 * prompt, calls the org's configured AI provider, logs the exchange, and returns the reply.
 * Per /docs/sprint-19-scope.md § Story 1 + /docs/sprint-25-scope.md § Story 1c.
 */

import { buildSystemPrompt } from './buildSystemPrompt'
import { countAssistantReplies, getRecentHistory } from './conversationLog'
import { getAiProvider, isAiConfiguredForOrg } from './providers/factory'
import { logAiUsage } from './usage'
import { estimateCost } from './costs'
import { botString } from '@/lib/whatsapp/strings'
import type { AppLocale } from '@/lib/i18n/locale'

const SAFETY_CAP = 3

/** Hebrew redirect text. For a recipient-language variant use botString(). */
export const HUMAN_REDIRECT_MESSAGE = botString('ai_human_redirect', 'he')

/**
 * Sync check: platform-level OpenAI key exists.
 * For org-level check, use isAiConfiguredForOrg(orgId) (async).
 */
export function isAiAssistantConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

export interface AiAssistantResult {
  reply: string
  promptTokens: number
  completionTokens: number
  provider: string
  model: string
}

/**
 * Generates an AI reply for an incoming WhatsApp message from a known parent.
 *
 * @returns The reply + token counts + provider info.
 *          Returns HUMAN_REDIRECT_MESSAGE when the safety cap is reached.
 */
export async function aiAssistant(
  orgId: string,
  phone: string,
  parentId: string | null,
  incomingMessage: string,
  locale: AppLocale = 'he'
): Promise<AiAssistantResult> {
  const humanRedirect = botString('ai_human_redirect', locale)

  // 1. Safety cap — prevent runaway spend
  let replyCount: number
  try {
    replyCount = await countAssistantReplies(orgId, phone)
  } catch (err) {
    console.error('[ai-assistant] Safety cap lookup failed — redirecting to human', {
      orgId,
      phone,
      err,
    })
    return {
      reply: humanRedirect,
      promptTokens: 0,
      completionTokens: 0,
      provider: 'unknown',
      model: 'unknown',
    }
  }

  if (replyCount >= SAFETY_CAP) {
    console.info('[ai-assistant] Safety cap reached — redirecting to human', {
      orgId,
      phone,
      replyCount,
    })
    return {
      reply: humanRedirect,
      promptTokens: 0,
      completionTokens: 0,
      provider: 'unknown',
      model: 'unknown',
    }
  }

  // 2. Build system prompt with live context
  const systemPrompt = await buildSystemPrompt(orgId, phone, parentId)

  // 3. Fetch recent conversation history (last 10 turns, past 24h)
  const history = await getRecentHistory(orgId, phone)

  // 4. Get org's AI provider and call it
  const { provider, providerName, model } = await getAiProvider(orgId)

  const result = await provider.chat({
    systemPrompt,
    history,
    userMessage: incomingMessage,
    maxTokens: 300,
    temperature: 0.3,
  })

  const reply = result.content || humanRedirect

  // 5. Structured log for cost tracking
  console.info('[ai-assistant] Reply generated', {
    orgId,
    phone,
    provider: providerName,
    model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  })

  // 6. Fire-and-forget usage logging (Sprint 25)
  logAiUsage({
    orgId,
    provider: providerName,
    model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    estimatedCostUsd: estimateCost(providerName, model, result.promptTokens, result.completionTokens),
  }).catch((err) => {
    console.error('[ai-assistant] Failed to log AI usage', { orgId, err })
  })

  return {
    reply,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    provider: providerName,
    model,
  }
}
