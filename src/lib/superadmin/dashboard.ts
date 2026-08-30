/**
 * Data for the platform overview at /admin.
 * Server-only — uses service role client.
 *
 * Per /docs/sprint-34-scope.md § /admin. Supersedes the Sprint 18 dashboard,
 * which reported tenant revenue (a sum over `charges` — a teacher billing a
 * parent) as though it were the platform's own, and built its activity list by
 * selecting every row of lessons, charges and leads platform-wide and folding
 * them in JS on every page load. Both are gone: revenue now comes from
 * ./metrics.ts, and last activity from the `organization_activity` view.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'

import { getAttentionQueue, type AttentionItem } from './attention'
import {
  getActivationFunnel,
  getSaasMetrics,
  type FunnelStage,
  type SaasMetrics,
  type SubscriptionRow,
} from './metrics'

export type PlatformActivity = {
  totalOrganizations: number
  activeOrganizationsLast30Days: number
  lessonsThisMonth: number
  newOrganizationsThisMonth: number
}

export type RecentOrg = {
  id: string
  name: string
  slug: string
  lastActivity: string | null
}

export type PlatformOverview = {
  metrics: SaasMetrics
  subscriptions: SubscriptionRow[]
  funnel: FunnelStage[]
  attention: AttentionItem[]
  activity: PlatformActivity
  recentOrgs: RecentOrg[]
}

/**
 * Last activity per org, straight from the view.
 *
 * The view aggregates in Postgres against (organization_id, updated_at)
 * indexes. The function it replaced transferred three whole tables to Node.
 */
export async function getLastActivityMap(): Promise<Map<string, string>> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('organization_activity')
    .select('organization_id, last_activity_at')

  if (error || !data) return new Map()

  return new Map(
    (data as { organization_id: string; last_activity_at: string | null }[])
      .filter((r): r is { organization_id: string; last_activity_at: string } =>
        Boolean(r.last_activity_at)
      )
      .map((r) => [r.organization_id, r.last_activity_at])
  )
}

async function getPlatformActivity(
  lastActivity: Map<string, string>
): Promise<PlatformActivity> {
  const db = createServiceRoleClient()
  const now = DateTime.utc()
  const monthStart = now.startOf('month').toISO()!
  const thirtyDaysAgo = now.minus({ days: 30 }).toISO()!

  const [orgsRes, newOrgsRes, lessonsRes] = await Promise.all([
    db.from('organizations').select('*', { count: 'exact', head: true }),
    db
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', monthStart),
    db
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .neq('status', 'cancelled')
      .gte('start_at', monthStart),
  ])

  let active = 0
  for (const ts of lastActivity.values()) {
    if (ts >= thirtyDaysAgo) active += 1
  }

  return {
    totalOrganizations: orgsRes.count ?? 0,
    activeOrganizationsLast30Days: active,
    lessonsThisMonth: lessonsRes.count ?? 0,
    newOrganizationsThisMonth: newOrgsRes.count ?? 0,
  }
}

async function getRecentOrgs(lastActivity: Map<string, string>): Promise<RecentOrg[]> {
  const ids = [...lastActivity.entries()]
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .slice(0, 10)
    .map(([id]) => id)

  if (ids.length === 0) return []

  const db = createServiceRoleClient()
  const { data } = await db.from('organizations').select('id, name, slug').in('id', ids)

  const byId = new Map((data ?? []).map((o) => [o.id, o]))

  return ids
    .map((id) => {
      const org = byId.get(id)
      if (!org) return null
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        lastActivity: lastActivity.get(id) ?? null,
      }
    })
    .filter((o): o is RecentOrg => o !== null)
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const [{ metrics, subscriptions }, lastActivity, funnel] = await Promise.all([
    getSaasMetrics(),
    getLastActivityMap(),
    getActivationFunnel(30),
  ])

  const [attention, activity, recentOrgs] = await Promise.all([
    getAttentionQueue(subscriptions),
    getPlatformActivity(lastActivity),
    getRecentOrgs(lastActivity),
  ])

  return { metrics, subscriptions, funnel, attention, activity, recentOrgs }
}
