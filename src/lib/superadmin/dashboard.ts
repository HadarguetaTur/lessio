/**
 * Platform-level KPI queries for the superadmin dashboard.
 * Server-only — uses service role client.
 *
 * Per /docs/sprint-18-scope.md § Story 2.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'

export type PlatformStats = {
  totalOrganizations: number
  activeOrganizationsLast30Days: number
  platformLessonsThisMonth: number
  platformRevenueThisMonth: number
}

export type NeedsSetupOrg = {
  id: string
  name: string
  slug: string
  missingWhatsApp: boolean
  missingPayment: boolean
}

export type RecentOrg = {
  id: string
  name: string
  slug: string
  lastActivity: string | null
}

export type PlatformDashboardData = {
  stats: PlatformStats
  needsSetup: NeedsSetupOrg[]
  recentOrgs: RecentOrg[]
}

export async function getPlatformDashboard(): Promise<PlatformDashboardData> {
  const db = createServiceRoleClient()

  const now = DateTime.utc()
  const monthStart = now.startOf('month').toISO()!
  const thirtyDaysAgo = now.minus({ days: 30 }).toISO()!

  const [orgsRes, lessonsRes, revenueRes] = await Promise.all([
    db.from('organizations').select('id, name, slug, whatsapp_phone_number_id, payment_provider'),
    db
      .from('lessons')
      .select('organization_id')
      .neq('status', 'cancelled')
      .gte('start_at', monthStart),
    db
      .from('charges')
      .select('organization_id, amount')
      .eq('status', 'paid')
      .gte('paid_at', monthStart),
  ])

  const orgs = orgsRes.data ?? []
  const lessons = lessonsRes.data ?? []
  const revenue = revenueRes.data ?? []

  const totalOrganizations = orgs.length
  const platformLessonsThisMonth = lessons.length
  const platformRevenueThisMonth = revenue.reduce((s, c) => s + Number(c.amount), 0)

  // Active orgs: had at least one lesson or charge in last 30 days
  const [recentLessonsRes, recentChargesRes] = await Promise.all([
    db
      .from('lessons')
      .select('organization_id')
      .gte('updated_at', thirtyDaysAgo),
    db
      .from('charges')
      .select('organization_id')
      .gte('updated_at', thirtyDaysAgo),
  ])

  const activeOrgIds = new Set([
    ...((recentLessonsRes.data ?? []).map((r) => r.organization_id)),
    ...((recentChargesRes.data ?? []).map((r) => r.organization_id)),
  ])
  const activeOrganizationsLast30Days = activeOrgIds.size

  // Needs-setup: missing WhatsApp or missing payment provider
  const needsSetup: NeedsSetupOrg[] = orgs
    .filter((o) => !o.whatsapp_phone_number_id || !o.payment_provider)
    .map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      missingWhatsApp: !o.whatsapp_phone_number_id,
      missingPayment: !o.payment_provider,
    }))

  // Recently active orgs: compute last activity per org
  const [lastLessonRes, lastChargeRes, lastLeadRes] = await Promise.all([
    db.from('lessons').select('organization_id, updated_at').order('updated_at', { ascending: false }),
    db.from('charges').select('organization_id, updated_at').order('updated_at', { ascending: false }),
    db.from('leads').select('organization_id, updated_at').order('updated_at', { ascending: false }),
  ])

  const lastActivityMap = new Map<string, string>()
  for (const row of [
    ...(lastLessonRes.data ?? []),
    ...(lastChargeRes.data ?? []),
    ...(lastLeadRes.data ?? []),
  ]) {
    const existing = lastActivityMap.get(row.organization_id)
    if (!existing || row.updated_at > existing) {
      lastActivityMap.set(row.organization_id, row.updated_at)
    }
  }

  const recentOrgs: RecentOrg[] = orgs
    .map((o) => ({ id: o.id, name: o.name, slug: o.slug, lastActivity: lastActivityMap.get(o.id) ?? null }))
    .filter((o) => o.lastActivity !== null)
    .sort((a, b) => (b.lastActivity! > a.lastActivity! ? 1 : -1))
    .slice(0, 10)

  return {
    stats: {
      totalOrganizations,
      activeOrganizationsLast30Days,
      platformLessonsThisMonth,
      platformRevenueThisMonth,
    },
    needsSetup,
    recentOrgs,
  }
}
