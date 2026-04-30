/**
 * AI cost estimation — Sprint 25 Story 2a.
 *
 * Hardcoded per-model price tiers (USD per 1M tokens).
 * Updated periodically as provider pricing changes.
 */

/** Price per 1M tokens: [input, output] */
const PRICE_TABLE: Record<string, [number, number]> = {
  // OpenAI
  'gpt-4o-mini':   [0.15, 0.60],
  'gpt-4o':        [2.50, 10.00],
  // Anthropic
  'claude-haiku-4-5-20251001':   [0.80, 4.00],
  'claude-sonnet-4-6-20250514':  [3.00, 15.00],
  // Google
  'gemini-2.0-flash':  [0.10, 0.40],
  'gemini-2.5-flash':  [0.15, 0.60],
}

/**
 * Estimate the USD cost for a single AI call.
 * Returns 0 if the model is not in the price table.
 */
export function estimateCost(
  _provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const prices = PRICE_TABLE[model]
  if (!prices) return 0

  const [inputPrice, outputPrice] = prices
  const cost = (promptTokens * inputPrice + completionTokens * outputPrice) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000 // 6 decimal places
}
