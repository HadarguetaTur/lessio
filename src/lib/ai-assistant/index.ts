/**
 * AI WhatsApp assistant.
 * Enforces a 3-reply-per-24h safety cap, builds a context-rich Hebrew system
 * prompt, calls OpenAI gpt-4o-mini, logs the exchange, and returns the reply.
 * Per /docs/sprint-19-scope.md § Story 1.
 */

import OpenAI from 'openai'
import { buildSystemPrompt } from './buildSystemPrompt'
import { countAssistantReplies, getRecentHistory } from './conversationLog'

const SAFETY_CAP = 3
const OPENAI_TIMEOUT_MS = 8_000
const OPENAI_MAX_RETRIES = 1
export const HUMAN_REDIRECT_MESSAGE =
  'לא הצלחתי לענות על השאלה שלך. אנא פנה/י ישירות לצוות בית הספר לסיוע.'

let _openai: OpenAI | null = null

export function isAiAssistantConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

function getOpenAI(): OpenAI {
  if (!isAiAssistantConfigured()) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: OPENAI_MAX_RETRIES,
    })
  }
  return _openai
}

/**
 * Generates an AI reply for an incoming WhatsApp message from a known parent.
 *
 * @returns The reply string to send back via WhatsApp.
 *          Returns HUMAN_REDIRECT_MESSAGE when the safety cap is reached.
 */
export async function aiAssistant(
  orgId: string,
  phone: string,
  parentId: string | null,
  incomingMessage: string
): Promise<string> {
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
    return HUMAN_REDIRECT_MESSAGE
  }

  if (replyCount >= SAFETY_CAP) {
    console.info('[ai-assistant] Safety cap reached — redirecting to human', {
      orgId,
      phone,
      replyCount,
    })
    return HUMAN_REDIRECT_MESSAGE
  }

  // 2. Build system prompt with live context
  const systemPrompt = await buildSystemPrompt(orgId, phone, parentId)

  // 3. Fetch recent conversation history (last 10 turns, past 24h)
  const history = await getRecentHistory(orgId, phone)

  // 4. Call OpenAI
  const openai = getOpenAI()
  let response: Awaited<ReturnType<typeof openai.chat.completions.create>>
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: incomingMessage },
      ],
      max_tokens: 300,
      temperature: 0.3,
    })
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error('[ai-assistant] OpenAI API error', {
        orgId,
        phone,
        status: err.status,
        message: err.message,
      })
    } else {
      console.error('[ai-assistant] Unexpected error', { orgId, phone, err })
    }
    throw err
  }

  const reply = response.choices[0]?.message?.content?.trim() ?? HUMAN_REDIRECT_MESSAGE

  // 5. Structured log for cost tracking
  console.info('[ai-assistant] Reply generated', {
    orgId,
    phone,
    model: response.model,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  })

  return reply
}
