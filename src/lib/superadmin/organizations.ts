/**
 * Organization list + detail queries for superadmin pages.
 * Server-only — uses service role client.
 *
 * Sprint 18 § Story 3; reworked in Sprint 34 (/docs/sprint-34-scope.md).
 *
 * Two Sprint-18 behaviours are gone. `buildLastActivityMap()` selected every
 * row of lessons, charges and leads platform-wide and folded them in JS on
 * every page load — it is now the `organization_activity` view. And the list
 * fetched all orgs before filtering them in JS; search and status now narrow
 * the query itself.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DateTime } from 'luxon'

import { listActiveSaasPlans } from '@/lib/saas/plans'
import type { SaasPlanName, SaasSubscriptionStatus } from '@/lib/saas/types'
import { getLastActivityMap } from './dashboard'
import { listSubscriptions } from './metrics'

/** Derived operational status — not persisted in DB. */
export type OrgStatus = 'needs_setup' | 'active' | 'inactive'

export type OrgQuotaSnapshot = {
  studentsUsed: number
  studentsLimit: number | null
  lessonsUsed: number
  lessonsLimit: number | null
  /** Highest utilisation across both quotas, or null when both are unlimited. */
  worstRatio: number | null
}

export type OrgListItem = {
  id: string
  name: string
  slug: string
  timezone: string
  status: OrgStatus
  lastActivity: string | null
  whatsAppConnected: boolean
  paymentConnected: boolean
  receiptConnected: boolean
  createdAt: string
  planName: SaasPlanName | null
  planLabelHe: string | null
  planLabelEn: string | null
  subscriptionStatus: SaasSubscriptionStatus | null
  monthlyValue: number
  quota: OrgQuotaSnapshot
}

export type OrgDetail = {
  id: string
  name: string
  slug: string
  timezone: string
  breakDurationMinutes: number
  minBookingNoticeHours: number
  billingMode: string
  whatsAppConnected: boolean
  paymentConnected: boolean
  receiptConnected: boolean
  createdAt: string
  lastActivity: string | null
  activeTeachers: number
  activeStudents: number
  pendingCharges: number
  attribution: Record<string, unknown> | null
}

function deriveStatus(org: {
  whatsapp_phone_number_id: string | null
  lastActivity: string | null
}): OrgStatus {
  if (!org.whatsapp_phone_number_id) return 'needs_setup'
  if (!org.lastActivity) return 'inactive'
  const thirtyDaysAgo = DateTime.utc().minus({ days: 30 }).toISO()!
  return org.lastActivity >= thirtyDaysAgo ? 'active' : 'inactive'
}

type UsageRow = {
  organization_id: string
  active_students: number
  lessons_this_month: number
}

function ratio(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null
  return used / limit
}

export async function getOrganizationsList(filters?: {
  search?: string
  status?: OrgStatus | ''
  missingSetup?: boolean
}): Promise<OrgListItem[]> {
  const db = createServiceRoleClient()

  let query = db
    .from('organizations')
    .select(
      'id, name, slug, timezone, created_at, whatsapp_phone_number_id, payment_provider, receipt_config_encrypted'
    )
    .order('created_at', { ascending: false })

  // Narrow in Postgres rather than after the fact. `or` needs the value inline,
  // so a comma or a parenthesis in the term would break out of the filter list
  // — strip them instead of escaping, since neither appears in a name or slug
  // anyone would search for.
  if (filters?.search) {
    const safe = filters.search.replace(/[(),*]/g, ' ').trim()
    if (safe) query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`)
  }
  if (filters?.missingSetup) {
    query = query.or('whatsapp_phone_number_id.is.null,payment_provider.is.null')
  }

  const [{ data: orgs }, lastActivityMap, subscriptions, usageRes, plans] =
    await Promise.all([
      query,
      getLastActivityMap(),
      listSubscriptions(),
      db
        .from('organization_usage')
        .select('organization_id, active_students, lessons_this_month'),
      listActiveSaasPlans(),
    ])

  if (!orgs) return []

  const subByOrg = new Map(subscriptions.map((s) => [s.organizationId, s]))
  const planById = new Map(plans.map((p) => [p.id, p]))
  const usageByOrg = new Map(
    ((usageRes.data ?? []) as unknown as UsageRow[]).map((u) => [u.organization_id, u])
  )

  const results: OrgListItem[] = orgs.map((o) => {
    const lastActivity = lastActivityMap.get(o.id) ?? null
    const sub = subByOrg.get(o.id)
    const plan = sub ? planById.get(sub.planId) : undefined
    const usage = usageByOrg.get(o.id)

    const studentsUsed = Number(usage?.active_students ?? 0)
    const lessonsUsed = Number(usage?.lessons_this_month ?? 0)
    const studentsLimit = plan?.students_quota ?? null
    const lessonsLimit = plan?.lessons_monthly_quota ?? null

    const ratios = [ratio(studentsUsed, studentsLimit), ratio(lessonsUsed, lessonsLimit)]
      .filter((r): r is number => r !== null)

    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      timezone: o.timezone,
      status: deriveStatus({
        whatsapp_phone_number_id: o.whatsapp_phone_number_id,
        lastActivity,
      }),
      lastActivity,
      whatsAppConnected: !!o.whatsapp_phone_number_id,
      paymentConnected: !!o.payment_provider,
      receiptConnected: !!o.receipt_config_encrypted,
      createdAt: o.created_at,
      planName: sub?.planName ?? null,
      planLabelHe: sub?.planLabelHe ?? null,
      planLabelEn: sub?.planLabelEn ?? null,
      subscriptionStatus: sub?.status ?? null,
      // Only money we are actually owed counts as MRR here, matching
      // REVENUE_STATUSES in ./metrics.ts — a trial must not inflate the column.
      monthlyValue:
        sub && (sub.status === 'active' || sub.status === 'past_due')
          ? sub.monthlyValue
          : 0,
      quota: {
        studentsUsed,
        studentsLimit,
        lessonsUsed,
        lessonsLimit,
        worstRatio: ratios.length > 0 ? Math.max(...ratios) : null,
      },
    }
  })

  // Derived from last activity, so it cannot be a WHERE clause.
  if (filters?.status) {
    return results.filter((o) => o.status === filters.status)
  }

  return results
}

export async function getOrganizationDetail(id: string): Promise<OrgDetail | null> {
  const db = createServiceRoleClient()

  const [orgRes, teachersRes, studentsRes, chargesRes, activityRes] = await Promise.all([
    db
      .from('organizations')
      .select(
        'id, name, slug, timezone, break_duration_minutes, min_booking_notice_hours, billing_mode, created_at, whatsapp_phone_number_id, payment_provider, receipt_config_encrypted, attribution'
      )
      .eq('id', id)
      .single(),
    db
      .from('teachers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id)
      .eq('is_active', true),
    db
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id)
      .eq('is_active', true),
    db
      .from('charges')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', id)
      .eq('status', 'pending'),
    db
      .from('organization_activity')
      .select('last_activity_at')
      .eq('organization_id', id)
      .maybeSingle(),
  ])

  if (!orgRes.data) return null

  const o = orgRes.data as typeof orgRes.data & { attribution: unknown }

  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    timezone: o.timezone,
    breakDurationMinutes: o.break_duration_minutes,
    minBookingNoticeHours: o.min_booking_notice_hours,
    billingMode: o.billing_mode ?? 'monthly',
    whatsAppConnected: !!o.whatsapp_phone_number_id,
    paymentConnected: !!o.payment_provider,
    receiptConnected: !!o.receipt_config_encrypted,
    createdAt: o.created_at,
    lastActivity:
      (activityRes.data as { last_activity_at: string | null } | null)?.last_activity_at ??
      null,
    activeTeachers: teachersRes.count ?? 0,
    activeStudents: studentsRes.count ?? 0,
    pendingCharges: chargesRes.count ?? 0,
    attribution:
      o.attribution && typeof o.attribution === 'object'
        ? (o.attribution as Record<string, unknown>)
        : null,
  }
}
