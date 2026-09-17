/**
 * The numbers behind /admin/attribution.
 *
 * Aggregated in memory on purpose. Organic traffic from group posts is hundreds
 * of pageviews a day at the very most, the rows are narrow, and doing it here
 * keeps the arithmetic unit-testable instead of buried in an SQL function. The
 * read is capped; if the cap is ever hit the page says so, and that is the
 * signal to move this into an RPC.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { LANDING_SECTIONS, type LandingSection } from './sections'

export type PageviewRecord = {
  visitor_id: string | null
  path: string
  link_slug: string | null
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  referrer_host: string | null
  sections_seen: number
  max_scroll_pct: number
  engaged_ms: number
  cta_clicks: string[]
  signup_org_id: string | null
  lead_id: string | null
}

const COLUMNS =
  'visitor_id, path, link_slug, source, medium, campaign, content, referrer_host, sections_seen, max_scroll_pct, engaged_ms, cta_clicks, signup_org_id, lead_id'

const CHUNK = 1000
export const REPORT_ROW_CAP = 20_000

export async function fetchPageviews(range: {
  fromIso: string
  toIso: string
  path?: string
}): Promise<{ rows: PageviewRecord[]; truncated: boolean }> {
  const db = createServiceRoleClient()
  const rows: PageviewRecord[] = []

  for (let offset = 0; offset < REPORT_ROW_CAP; offset += CHUNK) {
    let query = db
      .from('landing_pageviews')
      .select(COLUMNS)
      .gte('started_at', range.fromIso)
      .lt('started_at', range.toIso)
      .order('started_at', { ascending: false })
      .range(offset, offset + CHUNK - 1)
    if (range.path) query = query.eq('path', range.path)

    const { data, error } = await query
    if (error || !data) break
    rows.push(...(data as unknown as PageviewRecord[]))
    if (data.length < CHUNK) return { rows, truncated: false }
  }

  return { rows, truncated: rows.length >= REPORT_ROW_CAP }
}

export type SourceKind = 'link' | 'utm' | 'referrer' | 'direct'

export type SourceStats = {
  key: string
  kind: SourceKind
  /** The slug, the utm tuple, the referring host, or '' for direct. */
  name: string
  slug: string | null
  visits: number
  uniqueVisitors: number
  /** Visits that reached each section, keyed by section id. */
  reached: Record<LandingSection, number>
  medianEngagedMs: number
  medianScrollPct: number
  /** Visits with at least one CTA click. */
  visitsWithCta: number
  ctaCounts: Record<string, number>
  topCta: string | null
  signups: number
  leads: number
}

export type LandingReport = {
  totals: SourceStats
  sources: SourceStats[]
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * What a row is grouped under. A short link wins over its own UTM values —
 * two posts can share a campaign, and the post is the thing being compared.
 */
export function sourceKeyOf(row: PageviewRecord): { key: string; kind: SourceKind; name: string } {
  if (row.link_slug) return { key: `link:${row.link_slug}`, kind: 'link', name: row.link_slug }

  const utm = [row.source, row.medium, row.campaign, row.content]
  if (utm.some(Boolean)) {
    const name = utm.map((v) => v ?? '—').join(' / ')
    return { key: `utm:${name}`, kind: 'utm', name }
  }

  if (row.referrer_host) {
    return { key: `ref:${row.referrer_host}`, kind: 'referrer', name: row.referrer_host }
  }

  return { key: 'direct', kind: 'direct', name: '' }
}

function summarize(
  rows: PageviewRecord[],
  identity: { key: string; kind: SourceKind; name: string }
): SourceStats {
  const reached = Object.fromEntries(LANDING_SECTIONS.map((s) => [s, 0])) as Record<
    LandingSection,
    number
  >
  const visitors = new Set<string>()
  const ctaCounts: Record<string, number> = {}
  const signupOrgs = new Set<string>()
  const leadIds = new Set<string>()
  let anonymous = 0
  let visitsWithCta = 0

  for (const row of rows) {
    if (row.visitor_id) visitors.add(row.visitor_id)
    else anonymous += 1

    LANDING_SECTIONS.forEach((section, bit) => {
      if (row.sections_seen & (1 << bit)) reached[section] += 1
    })

    if (row.cta_clicks.length > 0) visitsWithCta += 1
    for (const cta of row.cta_clicks) ctaCounts[cta] = (ctaCounts[cta] ?? 0) + 1

    if (row.signup_org_id) signupOrgs.add(row.signup_org_id)
    if (row.lead_id) leadIds.add(row.lead_id)
  }

  const topCta =
    Object.entries(ctaCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    null

  return {
    ...identity,
    slug: identity.kind === 'link' ? identity.name : null,
    visits: rows.length,
    // A visitor with no cookie cannot be deduplicated; each counts once.
    uniqueVisitors: visitors.size + anonymous,
    reached,
    medianEngagedMs: median(rows.map((r) => r.engaged_ms)),
    medianScrollPct: median(rows.map((r) => r.max_scroll_pct)),
    visitsWithCta,
    ctaCounts,
    topCta,
    signups: signupOrgs.size,
    leads: leadIds.size,
  }
}

export function aggregatePageviews(rows: PageviewRecord[]): LandingReport {
  const groups = new Map<
    string,
    { identity: ReturnType<typeof sourceKeyOf>; rows: PageviewRecord[] }
  >()

  for (const row of rows) {
    const identity = sourceKeyOf(row)
    const group = groups.get(identity.key)
    if (group) group.rows.push(row)
    else groups.set(identity.key, { identity, rows: [row] })
  }

  const sources = [...groups.values()]
    .map((g) => summarize(g.rows, g.identity))
    .sort((a, b) => b.visits - a.visits || a.key.localeCompare(b.key))

  return {
    totals: summarize(rows, { key: 'all', kind: 'direct', name: '' }),
    sources,
  }
}
