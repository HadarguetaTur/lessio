/**
 * The unified "needs a decision now" queue for the platform overview.
 * Server-only; service-role client.
 *
 * Per /docs/sprint-34-scope.md § /admin — block 3.
 *
 * Replaces NeedsSetupList, which asked one question (is WhatsApp or payment
 * missing?) and so was silent about every situation that actually costs money:
 * a failed renewal, a trial about to lapse, a tenant pressed against a quota.
 */

import { DateTime } from 'luxon'

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { listActiveSaasPlans } from '@/lib/saas/plans'
import type { SubscriptionRow } from './metrics'

/** Ordered by how much it costs to ignore, not by how it was discovered. */
export type AttentionSeverity = 'critical' | 'warning' | 'info'

export type AttentionItem = {
  key: string
  kind:
    | 'past_due'
    | 'trial_ending'
    | 'quota_pressure'
    | 'stale_ticket'
    | 'missing_setup'
  severity: AttentionSeverity
  organizationId: string | null
  organizationName: string
  /** Interpolation values for the i18n string named by `kind`. */
  values: Record<string, string | number>
  href: string
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

/** Share of a quota at which a tenant is worth a conversation about upgrading. */
const QUOTA_PRESSURE_THRESHOLD = 0.8

/** How long an untouched open ticket is allowed to sit before it surfaces. */
const STALE_TICKET_HOURS = 24

type UsageRow = {
  organization_id: string
  active_students: number
  lessons_this_month: number
}

export async function getAttentionQueue(
  subscriptions: SubscriptionRow[]
): Promise<AttentionItem[]> {
  const db = createServiceRoleClient()
  const now = DateTime.utc()
  const items: AttentionItem[] = []

  // ── failed renewals ───────────────────────────────────────────────────────
  for (const s of subscriptions.filter((x) => x.status === 'past_due')) {
    items.push({
      key: `past_due:${s.id}`,
      kind: 'past_due',
      severity: 'critical',
      organizationId: s.organizationId,
      organizationName: s.organizationName,
      values: { amount: Math.round(s.monthlyValue) },
      href: `/admin/orgs/${s.organizationId}`,
    })
  }

  // ── trials about to lapse ─────────────────────────────────────────────────
  for (const s of subscriptions) {
    if (s.status !== 'trial' || !s.trialEndsAt) continue
    const endsAt = DateTime.fromISO(s.trialEndsAt)
    if (endsAt <= now) continue
    const days = Math.ceil(endsAt.diff(now, 'days').days)
    if (days > 7) continue
    items.push({
      key: `trial_ending:${s.id}`,
      kind: 'trial_ending',
      severity: days <= 2 ? 'critical' : 'warning',
      organizationId: s.organizationId,
      organizationName: s.organizationName,
      values: { days },
      href: `/admin/orgs/${s.organizationId}`,
    })
  }

  const [usageRes, orgsRes, ticketsRes, plans] = await Promise.all([
    db.from('organization_usage').select('organization_id, active_students, lessons_this_month'),
    db
      .from('organizations')
      .select('id, name, whatsapp_phone_number_id, payment_provider'),
    db
      .from('support_tickets')
      .select('id, organization_id, subject, updated_at, organizations ( name )')
      .in('status', ['open', 'in_progress'])
      .lt('updated_at', now.minus({ hours: STALE_TICKET_HOURS }).toISO()!)
      .order('updated_at', { ascending: true })
      .limit(20),
    listActiveSaasPlans(),
  ])

  // ── quota pressure ────────────────────────────────────────────────────────
  const planById = new Map(plans.map((p) => [p.id, p]))
  const usageByOrg = new Map(
    ((usageRes.data ?? []) as unknown as UsageRow[]).map((u) => [u.organization_id, u])
  )

  for (const s of subscriptions) {
    const plan = planById.get(s.planId)
    const usage = usageByOrg.get(s.organizationId)
    if (!plan || !usage) continue

    const checks: { used: number; limit: number | null; metric: 'students' | 'lessons' }[] = [
      { used: Number(usage.active_students), limit: plan.students_quota, metric: 'students' },
      {
        used: Number(usage.lessons_this_month),
        limit: plan.lessons_monthly_quota,
        metric: 'lessons',
      },
    ]

    for (const c of checks) {
      if (c.limit == null || c.limit <= 0) continue
      const ratio = c.used / c.limit
      if (ratio < QUOTA_PRESSURE_THRESHOLD) continue
      items.push({
        key: `quota:${s.organizationId}:${c.metric}`,
        kind: 'quota_pressure',
        severity: ratio >= 1 ? 'critical' : 'warning',
        organizationId: s.organizationId,
        organizationName: s.organizationName,
        values: {
          metric: c.metric,
          used: c.used,
          limit: c.limit,
          percent: Math.round(ratio * 100),
        },
        href: `/admin/orgs/${s.organizationId}`,
      })
    }
  }

  // ── tickets left sitting ──────────────────────────────────────────────────
  type TicketRow = {
    id: string
    organization_id: string
    subject: string
    updated_at: string
    organizations: { name: string } | null
  }
  for (const t of (ticketsRes.data ?? []) as unknown as TicketRow[]) {
    const hours = Math.floor(now.diff(DateTime.fromISO(t.updated_at), 'hours').hours)
    items.push({
      key: `ticket:${t.id}`,
      kind: 'stale_ticket',
      severity: hours >= 72 ? 'critical' : 'warning',
      organizationId: t.organization_id,
      organizationName: t.organizations?.name ?? '—',
      values: { hours, subject: t.subject },
      href: `/admin/support/${t.id}`,
    })
  }

  // ── never finished connecting ─────────────────────────────────────────────
  type OrgRow = {
    id: string
    name: string
    whatsapp_phone_number_id: string | null
    payment_provider: string | null
  }
  for (const o of (orgsRes.data ?? []) as OrgRow[]) {
    const missing: string[] = []
    if (!o.whatsapp_phone_number_id) missing.push('whatsapp')
    if (!o.payment_provider) missing.push('payment')
    if (missing.length === 0) continue
    items.push({
      key: `setup:${o.id}`,
      kind: 'missing_setup',
      severity: 'info',
      organizationId: o.id,
      organizationName: o.name,
      values: { missing: missing.join(','), count: missing.length },
      href: `/admin/orgs/${o.id}`,
    })
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
