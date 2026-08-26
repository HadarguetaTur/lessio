/**
 * Operator-side reads over the dev-issue queue — Sprint 32 M3.
 *
 * Callers have already passed requireSuperAdminSession().
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { TicketSeverity } from '@/lib/support/tickets'

export type DevIssueStatus = 'open' | 'investigating' | 'fixed' | 'wont_fix'

export const OPEN_DEV_ISSUE_STATUSES: readonly DevIssueStatus[] = ['open', 'investigating']

export interface DevIssue {
  id: string
  fingerprint: string | null
  title: string
  status: DevIssueStatus
  severity: TicketSeverity | null
  event_count: number
  org_count: number
  first_seen: string | null
  last_seen: string | null
  sample_stack: string | null
  github_issue_number: number | null
  github_issue_url: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type DevIssueFilter = 'open' | 'all' | DevIssueStatus

/** Noisiest first: the issue hurting the most people is the one to fix next. */
export async function listDevIssues(
  filter: DevIssueFilter = 'open',
  limit = 100
): Promise<DevIssue[]> {
  const db = createServiceRoleClient()

  let query = db.from('dev_issues').select('*').limit(limit)

  if (filter === 'open') {
    query = query.in('status', [...OPEN_DEV_ISSUE_STATUSES])
  } else if (filter !== 'all') {
    query = query.eq('status', filter)
  }

  const { data, error } = await query
    .order('org_count', { ascending: false })
    .order('event_count', { ascending: false })

  if (error) {
    console.error('[superadmin/devIssues] Failed to list', { error: error.message })
    return []
  }

  return (data ?? []) as DevIssue[]
}

export async function getDevIssue(id: string): Promise<DevIssue | null> {
  const db = createServiceRoleClient()
  const { data, error } = await db.from('dev_issues').select('*').eq('id', id).maybeSingle()

  if (error || !data) return null
  return data as DevIssue
}

export interface LinkedTicket {
  id: string
  subject: string
  status: string
  organization_id: string
  organization_name: string
}

/** The customer reports attached to this issue — who to tell when it is fixed. */
export async function getLinkedTickets(issueId: string): Promise<LinkedTicket[]> {
  const db = createServiceRoleClient()

  const { data: tickets, error } = await db
    .from('support_tickets')
    .select('id, subject, status, organization_id')
    .eq('dev_issue_id', issueId)
    .order('created_at', { ascending: false })

  if (error || !tickets?.length) return []

  const orgIds = [...new Set(tickets.map((t) => t.organization_id))]
  const { data: orgs } = await db.from('organizations').select('id, name').in('id', orgIds)
  const nameById = new Map((orgs ?? []).map((o) => [o.id, o.name]))

  return tickets.map((t) => ({
    ...t,
    organization_name: nameById.get(t.organization_id) ?? t.organization_id,
  }))
}

/** Recent raw events behind an issue — the detail the GitHub body summarises. */
export async function getRecentEvents(fingerprint: string, limit = 20) {
  const db = createServiceRoleClient()

  const { data, error } = await db
    .from('error_events')
    .select('id, message, route, source, organization_id, digest, created_at')
    .eq('fingerprint', fingerprint)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[superadmin/devIssues] Failed to load events', { error: error.message })
    return []
  }

  return data ?? []
}

/** Open tickets with no issue linked yet — the picker on a ticket detail page. */
export async function listUnlinkedOpenIssues(limit = 50): Promise<DevIssue[]> {
  return listDevIssues('open', limit)
}

export async function countOpenDevIssues(): Promise<number> {
  const db = createServiceRoleClient()

  const { count, error } = await db
    .from('dev_issues')
    .select('id', { count: 'exact', head: true })
    .in('status', [...OPEN_DEV_ISSUE_STATUSES])

  if (error) {
    console.error('[superadmin/devIssues] Failed to count', { error: error.message })
    return 0
  }

  return count ?? 0
}
