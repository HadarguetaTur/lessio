/**
 * AI usage tracking — Sprint 25 Story 2a.
 *
 * Logs each AI call to ai_usage_log (fire-and-forget).
 * Provides aggregate queries for the usage dashboard.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface LogAiUsageParams {
  orgId: string
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  estimatedCostUsd: number
  /** Which feature made the call (e.g. 'owner_copilot'). Untagged = parent assistant. */
  source?: string
  /** The phone whose message triggered the call — the unit the staff cap counts. */
  actorPhone?: string
}

/**
 * Insert a usage log row. Fire-and-forget — logs errors, never throws.
 * Returns the inserted row ID (or null on failure) for satisfaction tracking.
 */
export async function logAiUsage(params: LogAiUsageParams): Promise<string | null> {
  try {
    const db = createServiceRoleClient()
    const { data, error } = await db
      .from('ai_usage_log')
      .insert({
        organization_id: params.orgId,
        provider: params.provider,
        model: params.model,
        prompt_tokens: params.promptTokens,
        completion_tokens: params.completionTokens,
        estimated_cost_usd: params.estimatedCostUsd,
        satisfaction: 'none',
        source: params.source ?? null,
        actor_phone: params.actorPhone ?? null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[ai-usage] Failed to log usage', { orgId: params.orgId, error: error.message })
      return null
    }
    return data?.id ?? null
  } catch (err) {
    console.error('[ai-usage] Unexpected error logging usage', { orgId: params.orgId, err })
    return null
  }
}

/**
 * How many copilot calls a staff phone made in the last 24 hours. Used for the
 * daily cap. Fails open (returns 0 on error) like the WhatsApp rate limiter —
 * a broken counter must not silence the copilot.
 */
export async function countOwnerCopilotCalls(orgId: string, actorPhone: string): Promise<number> {
  try {
    const db = createServiceRoleClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { count, error } = await db
      .from('ai_usage_log')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('source', 'owner_copilot')
      .eq('actor_phone', actorPhone)
      .gte('created_at', since)

    if (error) {
      console.error('[ai-usage] Failed to count copilot calls', { orgId, error: error.message })
      return 0
    }
    return count ?? 0
  } catch (err) {
    console.error('[ai-usage] Unexpected error counting copilot calls', { orgId, err })
    return 0
  }
}

/**
 * Update satisfaction rating on a usage log row.
 */
export async function updateSatisfaction(
  logId: string,
  satisfaction: 'positive' | 'negative'
): Promise<void> {
  const db = createServiceRoleClient()
  const { error } = await db
    .from('ai_usage_log')
    .update({ satisfaction })
    .eq('id', logId)

  if (error) {
    console.error('[ai-usage] Failed to update satisfaction', { logId, error: error.message })
  }
}

/**
 * Find the most recent usage log row for a phone number (via conversation_log join).
 * Used for satisfaction tracking — looks for entries within the last 5 minutes.
 */
export async function findRecentUsageLog(
  orgId: string,
  phone: string
): Promise<{ id: string } | null> {
  const db = createServiceRoleClient()
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('ai_usage_log')
    .select('id')
    .eq('organization_id', orgId)
    .eq('satisfaction', 'none')
    .gte('created_at', fiveMinAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[ai-usage] Failed to find recent usage log', { orgId, phone, error: error.message })
    return null
  }

  return data as { id: string } | null
}

export interface UsageSummary {
  totalRequests: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalCostUsd: number
  positiveCount: number
  negativeCount: number
  dailyData: Array<{
    date: string
    requests: number
    tokens: number
    costUsd: number
  }>
}

/**
 * Aggregate usage data for a given org and month (YYYY-MM format).
 */
export async function getUsageSummary(orgId: string, month: string): Promise<UsageSummary> {
  const db = createServiceRoleClient()

  // Parse month to get date range
  const [year, mon] = month.split('-').map(Number)
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`
  const endMonth = mon === 12 ? 1 : mon + 1
  const endYear = mon === 12 ? year + 1 : year
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const { data: rows, error } = await db
    .from('ai_usage_log')
    .select('date, prompt_tokens, completion_tokens, estimated_cost_usd, satisfaction')
    .eq('organization_id', orgId)
    .gte('date', startDate)
    .lt('date', endDate)
    .order('date', { ascending: true })

  if (error) {
    console.error('[ai-usage] Failed to fetch usage summary', { orgId, month, error: error.message })
    return {
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalCostUsd: 0,
      positiveCount: 0,
      negativeCount: 0,
      dailyData: [],
    }
  }

  type Row = {
    date: string
    prompt_tokens: number
    completion_tokens: number
    estimated_cost_usd: number
    satisfaction: string
  }

  const typedRows = (rows ?? []) as Row[]

  let totalRequests = 0
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let totalCostUsd = 0
  let positiveCount = 0
  let negativeCount = 0

  const dailyMap = new Map<string, { requests: number; tokens: number; costUsd: number }>()

  for (const row of typedRows) {
    totalRequests++
    totalPromptTokens += row.prompt_tokens
    totalCompletionTokens += row.completion_tokens
    totalCostUsd += Number(row.estimated_cost_usd)
    if (row.satisfaction === 'positive') positiveCount++
    if (row.satisfaction === 'negative') negativeCount++

    const existing = dailyMap.get(row.date)
    if (existing) {
      existing.requests++
      existing.tokens += row.prompt_tokens + row.completion_tokens
      existing.costUsd += Number(row.estimated_cost_usd)
    } else {
      dailyMap.set(row.date, {
        requests: 1,
        tokens: row.prompt_tokens + row.completion_tokens,
        costUsd: Number(row.estimated_cost_usd),
      })
    }
  }

  const dailyData = Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    ...data,
  }))

  return {
    totalRequests,
    totalPromptTokens,
    totalCompletionTokens,
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    positiveCount,
    negativeCount,
    dailyData,
  }
}
