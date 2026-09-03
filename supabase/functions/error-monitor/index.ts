/**
 * error-monitor — Supabase Edge Function
 * Sprint 32 M3.
 *
 * Trigger: scheduled cron, hourly.
 *
 * Reads the last 24h of error_events, groups them by fingerprint, and promotes
 * any group past the threshold into a dev_issue — opening a GitHub issue and
 * alerting the superadmins the first time it does so. Then sweeps events older
 * than 30 days.
 *
 * The point is that nobody has to notice. Before this, a bug that hit twenty
 * customers looked exactly like silence until one of them wrote in.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCronRequest, getSupabaseSecretKey } from '../_shared/supabaseSecret.ts'

const WINDOW_HOURS = 24
const RETENTION_DAYS = 30
/** One alert per fingerprint per day, however often the cron runs. */
const ALERT_THROTTLE_HOURS = 24

// ── Threshold ────────────────────────────────────────────────────────────────
// SYNC: mirrored from src/lib/telemetry/threshold.ts, which is where the tests
// live (Vitest does not scan supabase/functions/). Update both together.

const MIN_EVENTS = 5
const MIN_EVENTS_MULTI_ORG = 3
const MIN_ORGS_FOR_MULTI = 2

function crossesThreshold(stats: { eventCount: number; orgCount: number }): boolean {
  if (stats.eventCount >= MIN_EVENTS) return true
  return stats.orgCount >= MIN_ORGS_FOR_MULTI && stats.eventCount >= MIN_EVENTS_MULTI_ORG
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ErrorEventRow {
  fingerprint: string
  name: string | null
  message: string | null
  route: string | null
  source: string
  organization_id: string | null
  stack: string | null
  created_at: string
}

interface Group {
  fingerprint: string
  events: ErrorEventRow[]
  orgIds: Set<string>
  firstSeen: string
  lastSeen: string
}

Deno.serve(async (_req) => {
  const authError = authorizeCronRequest(_req)
  if (authError) return authError

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    getSupabaseSecretKey()
  )

  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()

  const { data: events, error } = await db
    .from('error_events')
    .select('fingerprint, name, message, route, source, organization_id, stack, created_at')
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(10_000)

  if (error) {
    console.error('[error-monitor] Failed to read error events', { error: error.message })
    return json({ error: error.message }, 500)
  }

  const groups = groupByFingerprint((events ?? []) as ErrorEventRow[])
  let promoted = 0
  let filed = 0
  let alerted = 0

  for (const group of groups.values()) {
    const stats = { eventCount: group.events.length, orgCount: group.orgIds.size }
    if (!crossesThreshold(stats)) continue

    promoted++
    const sample = group.events[group.events.length - 1]!
    const title = buildTitle(sample)

    // Upsert on the UNIQUE fingerprint: a group can never open a second issue,
    // however many times the cron sees it.
    const { data: issue, error: upsertError } = await db
      .from('dev_issues')
      .upsert(
        {
          fingerprint: group.fingerprint,
          title,
          event_count: stats.eventCount,
          org_count: stats.orgCount,
          first_seen: group.firstSeen,
          last_seen: group.lastSeen,
          sample_stack: sample.stack,
        },
        { onConflict: 'fingerprint' }
      )
      .select('id, status, github_issue_url')
      .single()

    if (upsertError || !issue) {
      console.error('[error-monitor] Failed to upsert dev issue', {
        fingerprint: group.fingerprint,
        error: upsertError?.message,
      })
      continue
    }

    // Only ever file once — the guard is the stored URL, not "did we just
    // create the row", so a crash between the upsert and the API call is
    // recoverable on the next run rather than filing a duplicate.
    if (!issue.github_issue_url) {
      const url = await fileGithubIssue(title, group, sample, stats)
      if (url) {
        filed++
        await db
          .from('dev_issues')
          .update({ github_issue_url: url.htmlUrl, github_issue_number: url.number })
          .eq('id', issue.id)
      }
    }

    if (await shouldAlert(db, group.fingerprint)) {
      alerted += await alertSuperadmins(db, group.fingerprint, title, stats, issue.id)
    }
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error: sweepError } = await db.from('error_events').delete().lt('created_at', cutoff)
  if (sweepError) {
    console.error('[error-monitor] Retention sweep failed', { error: sweepError.message })
  }

  console.info('[error-monitor] Run complete', {
    events: events?.length ?? 0,
    groups: groups.size,
    promoted,
    filed,
    alerted,
  })

  return json({ events: events?.length ?? 0, groups: groups.size, promoted, filed, alerted }, 200)
})

function groupByFingerprint(events: ErrorEventRow[]): Map<string, Group> {
  const groups = new Map<string, Group>()

  for (const event of events) {
    const existing = groups.get(event.fingerprint)
    if (!existing) {
      groups.set(event.fingerprint, {
        fingerprint: event.fingerprint,
        events: [event],
        orgIds: new Set(event.organization_id ? [event.organization_id] : []),
        firstSeen: event.created_at,
        lastSeen: event.created_at,
      })
      continue
    }

    existing.events.push(event)
    if (event.organization_id) existing.orgIds.add(event.organization_id)
    if (event.created_at < existing.firstSeen) existing.firstSeen = event.created_at
    if (event.created_at > existing.lastSeen) existing.lastSeen = event.created_at
  }

  return groups
}

function buildTitle(sample: ErrorEventRow): string {
  const name = sample.name ?? 'Error'
  const message = (sample.message ?? '').split('\n')[0]!.trim()
  const route = sample.route ? ` (${sample.route})` : ''
  const title = `${name}: ${message}${route}`
  return title.length <= 200 ? title : title.slice(0, 199) + '…'
}

/**
 * Opens the GitHub issue.
 *
 * The body carries everything needed to start work without opening the
 * dashboard first — that is the whole point of filing it there, where Claude
 * Code can pick it up.
 */
async function fileGithubIssue(
  title: string,
  group: Group,
  sample: ErrorEventRow,
  stats: { eventCount: number; orgCount: number }
): Promise<{ htmlUrl: string; number: number } | null> {
  const token = Deno.env.get('GITHUB_ISSUES_TOKEN')
  const repo = Deno.env.get('GITHUB_ISSUES_REPO')

  // Optional by design: without a token the internal queue still works.
  if (!token || !repo) return null

  const body = [
    '> Filed automatically by the `error-monitor` cron.',
    '',
    `**Fingerprint:** \`${group.fingerprint}\``,
    `**Occurrences (last ${WINDOW_HOURS}h):** ${stats.eventCount} across ${stats.orgCount} organization(s)`,
    `**First seen:** ${group.firstSeen}`,
    `**Last seen:** ${group.lastSeen}`,
    `**Route:** \`${sample.route ?? 'unknown'}\``,
    `**Source:** ${sample.source}`,
    '',
    '### Message',
    '```',
    (sample.message ?? '(none)').slice(0, 1000),
    '```',
    '',
    '### Sample stack',
    '```',
    (sample.stack ?? '(no stack captured)').slice(0, 4000),
    '```',
  ].join('\n')

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels: ['bug', 'auto-filed'] }),
    })

    if (!response.ok) {
      console.error('[error-monitor] GitHub issue creation failed', {
        status: response.status,
        body: (await response.text()).slice(0, 500),
      })
      return null
    }

    const created = await response.json()
    return { htmlUrl: created.html_url, number: created.number }
  } catch (err) {
    console.error('[error-monitor] GitHub request threw', { err: String(err) })
    return null
  }
}

/**
 * Throttle, replicating hasRecentUnreadSuperadminNotification from
 * src/lib/notifications (Deno cannot import it). Keyed on the fingerprint,
 * which the body always carries.
 */
async function shouldAlert(
  db: ReturnType<typeof createClient>,
  fingerprint: string
): Promise<boolean> {
  const since = new Date(Date.now() - ALERT_THROTTLE_HOURS * 60 * 60 * 1000).toISOString()

  const { count, error } = await db
    .from('in_app_notifications')
    .select('id', { count: 'exact', head: true })
    .is('organization_id', null)
    .eq('type', 'dev_issue_new')
    .is('read_at', null)
    .gt('created_at', since)
    .like('body', `%${fingerprint}%`)

  if (error) {
    console.error('[error-monitor] Throttle check failed', { error: error.message })
    // Stay quiet rather than risk a storm.
    return false
  }

  return (count ?? 0) === 0
}

/**
 * @returns how many notifications were actually written — not how many we
 * intended to write. The run summary is this cron's only visibility, so a
 * counter that reports sends which never happened would hide a broken alert
 * path (no active superadmin, a failing insert) indefinitely.
 */
async function alertSuperadmins(
  db: ReturnType<typeof createClient>,
  fingerprint: string,
  title: string,
  stats: { eventCount: number; orgCount: number },
  issueId: string
): Promise<number> {
  const { data: superadmins, error } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'superadmin')
    .eq('is_active', true)

  if (error) {
    console.error('[error-monitor] Failed to resolve superadmins', { error: error.message })
    return 0
  }

  if (!superadmins?.length) {
    console.warn('[error-monitor] No active superadmin to alert', { fingerprint })
    return 0
  }

  const { error: insertError } = await db.from('in_app_notifications').insert(
    superadmins.map((p: { id: string }) => ({
      organization_id: null,
      recipient_profile_id: p.id,
      type: 'dev_issue_new',
      title,
      // The fingerprint must appear here — the throttle above matches on it.
      body: `${stats.eventCount} occurrences across ${stats.orgCount} org(s) · ${fingerprint}`,
      action_url: `/admin/dev-issues/${issueId}`,
    }))
  )

  if (insertError) {
    console.error('[error-monitor] Failed to write superadmin alert', {
      fingerprint,
      error: insertError.message,
    })
    return 0
  }

  return superadmins.length
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
