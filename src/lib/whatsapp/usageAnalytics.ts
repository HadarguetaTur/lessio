/**
 * WhatsApp usage & cost analytics — the data behind the "Usage" tab on
 * /settings/whatsapp.
 *
 * Volumes and costs come straight from Meta's WABA analytics fields, not from a
 * local send log: Meta is the party doing the billing, so its numbers are the
 * only ones an org owner can reconcile against a WhatsApp Manager invoice, and
 * they include history from before this feature shipped. Primary source is
 * `pricing_analytics` (per-message pricing, July 2025+); `conversation_analytics`
 * is the fallback for a WABA still on the legacy conversation model.
 *
 * Results are cached in whatsapp_usage_cache for CACHE_TTL_HOURS per (org,
 * period). On a Meta failure the stale cache row is served with `stale: true`.
 *
 * A future per-message log (whatsapp_message_log + the `statuses` webhook)
 * would enable breakdowns by template type; nothing here blocks that.
 */

import { z } from 'zod'
import { DateTime } from 'luxon'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { META_API_VERSION } from './graphVersion'

const CACHE_TTL_HOURS = 6

export type UsageDays = 30 | 60 | 90

export type PricingCategory = 'marketing' | 'utility' | 'service' | 'authentication' | 'unknown'

export const PRICING_CATEGORIES: PricingCategory[] = [
  'marketing',
  'utility',
  'service',
  'authentication',
  'unknown',
]

export interface CategoryTotals {
  volume: number
  costUsd: number
}

export interface WhatsAppUsageSummary {
  days: UsageDays
  /** ISO dates (UTC) of the covered range, inclusive start / exclusive end. */
  startDate: string
  endDate: string
  totalMessages: number
  billableMessages: number
  freeMessages: number
  totalCostUsd: number
  byCategory: Record<PricingCategory, CategoryTotals>
  daily: Array<{
    date: string
    volume: number
    costUsd: number
    byCategory: Partial<Record<PricingCategory, CategoryTotals>>
  }>
  /** When the numbers were fetched from Meta (ISO). */
  fetchedAt: string
  /** True when Meta was unreachable and this is an expired cache copy. */
  stale: boolean
}

// ── Meta response parsing ────────────────────────────────────────────────────
// Tolerant on purpose: Meta adds fields and enum values without notice, so we
// validate only what we read and skip data points that don't parse.

const PricingPointSchema = z.looseObject({
  start: z.number(),
  end: z.number(),
  volume: z.number(),
  cost: z.number().optional(),
  pricing_category: z.string().optional(),
  pricing_type: z.string().optional(),
})

const ConversationPointSchema = z.looseObject({
  start: z.number(),
  end: z.number(),
  conversation: z.number(),
  cost: z.number().optional(),
  conversation_category: z.string().optional(),
  conversation_type: z.string().optional(),
})

const AnalyticsEnvelopeSchema = z.looseObject({
  pricing_analytics: z.looseObject({ data: z.array(z.looseObject({ data_points: z.array(z.unknown()).optional() })) }).optional(),
  conversation_analytics: z.looseObject({ data: z.array(z.looseObject({ data_points: z.array(z.unknown()).optional() })) }).optional(),
  error: z.looseObject({ message: z.string().optional(), code: z.number().optional() }).optional(),
})

interface NormalizedPoint {
  startUnix: number
  volume: number
  costUsd: number
  category: PricingCategory
  free: boolean
}

function normalizeCategory(raw: string | undefined): PricingCategory {
  switch ((raw ?? '').toUpperCase()) {
    case 'MARKETING':
    case 'MARKETING_LITE':
      return 'marketing'
    case 'UTILITY':
      return 'utility'
    case 'SERVICE':
      return 'service'
    case 'AUTHENTICATION':
    case 'AUTHENTICATION_INTERNATIONAL':
      return 'authentication'
    default:
      return 'unknown'
  }
}

class MetaAnalyticsError extends Error {}

async function fetchAnalyticsField(
  wabaId: string,
  accessToken: string,
  field: string
): Promise<unknown> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${wabaId}?fields=${field}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const parsed = AnalyticsEnvelopeSchema.safeParse(body)
    const message = parsed.success ? parsed.data.error?.message : undefined
    throw new MetaAnalyticsError(message ?? `Graph API ${res.status}`)
  }
  return body
}

/**
 * Fetch per-message pricing analytics for a WABA. Throws MetaAnalyticsError on
 * a Graph error (caller falls back to conversation analytics).
 */
export async function fetchPricingAnalytics(
  wabaId: string,
  accessToken: string,
  startUnix: number,
  endUnix: number
): Promise<NormalizedPoint[]> {
  const field =
    `pricing_analytics.start(${startUnix}).end(${endUnix}).granularity(DAILY)` +
    `.dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`
  const body = await fetchAnalyticsField(wabaId, accessToken, field)

  const envelope = AnalyticsEnvelopeSchema.safeParse(body)
  const buckets = envelope.success ? envelope.data.pricing_analytics?.data : undefined
  if (!buckets) throw new MetaAnalyticsError('pricing_analytics missing from response')

  const points: NormalizedPoint[] = []
  for (const bucket of buckets) {
    for (const raw of bucket.data_points ?? []) {
      const parsed = PricingPointSchema.safeParse(raw)
      if (!parsed.success) continue
      const p = parsed.data
      const category = normalizeCategory(p.pricing_category)
      const type = (p.pricing_type ?? '').toUpperCase()
      points.push({
        startUnix: p.start,
        volume: p.volume,
        costUsd: p.cost ?? 0,
        category,
        free: category === 'service' || type.startsWith('FREE'),
      })
    }
  }
  return points
}

/** Legacy conversation-based analytics, mapped onto the same shape. */
async function fetchConversationAnalytics(
  wabaId: string,
  accessToken: string,
  startUnix: number,
  endUnix: number
): Promise<NormalizedPoint[]> {
  const field =
    `conversation_analytics.start(${startUnix}).end(${endUnix}).granularity(DAILY)` +
    `.dimensions(["CONVERSATION_CATEGORY","CONVERSATION_TYPE"])`
  const body = await fetchAnalyticsField(wabaId, accessToken, field)

  const envelope = AnalyticsEnvelopeSchema.safeParse(body)
  const buckets = envelope.success ? envelope.data.conversation_analytics?.data : undefined
  if (!buckets) throw new MetaAnalyticsError('conversation_analytics missing from response')

  const points: NormalizedPoint[] = []
  for (const bucket of buckets) {
    for (const raw of bucket.data_points ?? []) {
      const parsed = ConversationPointSchema.safeParse(raw)
      if (!parsed.success) continue
      const p = parsed.data
      const category = normalizeCategory(p.conversation_category)
      const type = (p.conversation_type ?? '').toUpperCase()
      points.push({
        startUnix: p.start,
        volume: p.conversation,
        costUsd: p.cost ?? 0,
        category,
        free: category === 'service' || type.startsWith('FREE'),
      })
    }
  }
  return points
}

function emptyByCategory(): Record<PricingCategory, CategoryTotals> {
  return {
    marketing: { volume: 0, costUsd: 0 },
    utility: { volume: 0, costUsd: 0 },
    service: { volume: 0, costUsd: 0 },
    authentication: { volume: 0, costUsd: 0 },
    unknown: { volume: 0, costUsd: 0 },
  }
}

const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000

function buildSummary(
  points: NormalizedPoint[],
  days: UsageDays,
  startDate: string,
  endDate: string,
  fetchedAtIso: string
): WhatsAppUsageSummary {
  const byCategory = emptyByCategory()
  const dailyMap = new Map<string, WhatsAppUsageSummary['daily'][number]>()

  let totalMessages = 0
  let billableMessages = 0
  let freeMessages = 0
  let totalCostUsd = 0

  for (const p of points) {
    if (p.volume === 0 && p.costUsd === 0) continue
    totalMessages += p.volume
    totalCostUsd += p.costUsd
    if (p.free) freeMessages += p.volume
    else billableMessages += p.volume

    byCategory[p.category].volume += p.volume
    byCategory[p.category].costUsd = round(byCategory[p.category].costUsd + p.costUsd)

    const date = DateTime.fromSeconds(p.startUnix, { zone: 'utc' }).toISODate() ?? startDate
    const day = dailyMap.get(date) ?? { date, volume: 0, costUsd: 0, byCategory: {} }
    day.volume += p.volume
    day.costUsd = round(day.costUsd + p.costUsd)
    const dayCat = day.byCategory[p.category] ?? { volume: 0, costUsd: 0 }
    dayCat.volume += p.volume
    dayCat.costUsd = round(dayCat.costUsd + p.costUsd)
    day.byCategory[p.category] = dayCat
    dailyMap.set(date, day)
  }

  return {
    days,
    startDate,
    endDate,
    totalMessages,
    billableMessages,
    freeMessages,
    totalCostUsd: round(totalCostUsd),
    byCategory,
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    fetchedAt: fetchedAtIso,
    stale: false,
  }
}

function emptySummary(days: UsageDays, startDate: string, endDate: string): WhatsAppUsageSummary {
  return buildSummary([], days, startDate, endDate, DateTime.utc().toISO())
}

/**
 * Usage summary for the last `days` days, cached for CACHE_TTL_HOURS.
 * Returns null when the org has no connected WABA. Never throws: on a Meta
 * failure it serves the expired cache row (`stale: true`) or an empty summary.
 */
export async function getWhatsAppUsage(
  orgId: string,
  days: UsageDays
): Promise<WhatsAppUsageSummary | null> {
  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_waba_id, whatsapp_access_token')
    .eq('id', orgId)
    .single()

  if (!org?.whatsapp_waba_id || !org?.whatsapp_access_token) return null

  const { data: cached } = await db
    .from('whatsapp_usage_cache')
    .select('payload, fetched_at')
    .eq('organization_id', orgId)
    .eq('days', days)
    .maybeSingle()

  const now = DateTime.utc()
  if (cached && DateTime.fromISO(cached.fetched_at) > now.minus({ hours: CACHE_TTL_HOURS })) {
    return cached.payload as WhatsAppUsageSummary
  }

  const end = now.startOf('day').plus({ days: 1 }) // include today (partial)
  const start = end.minus({ days })
  const startDate = start.toISODate()
  const endDate = end.toISODate()

  let accessToken: string
  try {
    accessToken = decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[whatsapp/usage] Token decryption failed', { orgId, err })
    return emptySummary(days, startDate, endDate)
  }

  try {
    let points: NormalizedPoint[]
    try {
      points = await fetchPricingAnalytics(org.whatsapp_waba_id, accessToken, start.toSeconds(), end.toSeconds())
    } catch (err) {
      // WABAs still on the legacy conversation model reject pricing_analytics.
      console.warn('[whatsapp/usage] pricing_analytics failed, trying conversation_analytics', {
        orgId,
        err: err instanceof Error ? err.message : err,
      })
      points = await fetchConversationAnalytics(org.whatsapp_waba_id, accessToken, start.toSeconds(), end.toSeconds())
    }

    const summary = buildSummary(points, days, startDate, endDate, now.toISO())

    const { error: upsertError } = await db
      .from('whatsapp_usage_cache')
      .upsert(
        { organization_id: orgId, days, payload: summary, fetched_at: now.toISO() },
        { onConflict: 'organization_id,days' }
      )
    if (upsertError) {
      console.error('[whatsapp/usage] Failed to cache summary', { orgId, days, error: upsertError.message })
    }

    return summary
  } catch (err) {
    console.error('[whatsapp/usage] Meta analytics fetch failed', {
      orgId,
      days,
      err: err instanceof Error ? err.message : err,
    })
    if (cached) {
      return { ...(cached.payload as WhatsAppUsageSummary), stale: true }
    }
    return emptySummary(days, startDate, endDate)
  }
}

/** Normalize an arbitrary query-param value to a supported period. */
export function parseUsageDays(raw: string | undefined): UsageDays {
  return raw === '60' ? 60 : raw === '90' ? 90 : 30
}
