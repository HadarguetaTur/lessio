/**
 * homework-reminders — Supabase Edge Function
 * Per /docs/sprint-14-scope.md § Stories 6 + 9
 *
 * Trigger: scheduled cron, daily at 08:00 UTC (0 8 * * *)
 *
 * Algorithm (per org):
 *   1. Mark past-due pending assignments as 'overdue' (Story 9)
 *   2. Find assignments with due_date = tomorrow
 *   3. For each assignment, resolve target phone (student → primary parent)
 *   4. Check notification_log dedup — skip if already notified
 *   5. Send WhatsApp reminder
 *   6. Insert notification_log row
 *
 * Only runs for orgs with reminders_enabled=true and a connected WhatsApp number.
 * Failures are isolated per org/assignment.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptToken } from '../_shared/crypto.ts'
import { sendTextMessage } from '../_shared/whatsapp.ts'

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  // deno-lint-ignore no-explicit-any
  const db = createClient(supabaseUrl, serviceRoleKey) as any

  // ── 1. Fetch orgs with reminders enabled + WhatsApp connected ────────────────
  const { data: orgs, error: orgsError } = await db
    .from('organizations')
    .select('id, timezone, whatsapp_phone_number_id, whatsapp_access_token')
    .eq('reminders_enabled', true)
    .not('whatsapp_phone_number_id', 'is', null)
    .not('whatsapp_access_token', 'is', null)

  if (orgsError) {
    console.error('[homework-reminders] Failed to fetch orgs', { error: orgsError.message })
    return new Response('error fetching orgs', { status: 500 })
  }

  if (!orgs || orgs.length === 0) {
    return new Response('no orgs to process', { status: 200 })
  }

  for (const org of orgs) {
    try {
      await processOrg(db, org)
    } catch (err) {
      console.error('[homework-reminders] Unhandled error for org', {
        org_id: org.id,
        error: String(err),
      })
    }
  }

  return new Response('ok', { status: 200 })
})

/** YYYY-MM-DD in IANA timezone (same pattern as src/lib/lessons getTodayRange). */
function ymdInTimezone(d: Date, timeZone: string): string {
  return d.toLocaleDateString('sv-SE', { timeZone })
}

// deno-lint-ignore no-explicit-any
async function processOrg(db: any, org: any): Promise<void> {
  const orgId: string = org.id
  const tz: string = org.timezone || 'UTC'

  // ── Story 9: Mark overdue assignments before processing reminders ─────────────
  // Run first so that due-tomorrow query is consistent.
  const today = ymdInTimezone(new Date(), tz)
  const { error: overdueError } = await db
    .from('homework_assignments')
    .update({ status: 'overdue' })
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .lt('due_date', today)

  if (overdueError) {
    console.error('[homework-reminders] Failed to mark overdue', {
      org_id: orgId,
      error: overdueError.message,
    })
    // Non-fatal — continue to reminders
  }

  // ── "Tomorrow" calendar date in org timezone (not pure UTC midnight) ─────────
  const now = new Date()
  const tomorrowStr = ymdInTimezone(new Date(now.getTime() + 24 * 60 * 60 * 1000), tz)

  // ── Fetch assignments due tomorrow ───────────────────────────────────────────
  const { data: assignments, error: asgError } = await db
    .from('homework_assignments')
    .select(`
      id,
      title,
      due_date,
      students (
        phone,
        relationships (
          is_primary,
          parents ( phone )
        )
      )
    `)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .eq('due_date', tomorrowStr)

  if (asgError) {
    console.error('[homework-reminders] Failed to fetch assignments', {
      org_id: orgId,
      error: asgError.message,
    })
    return
  }

  if (!assignments || assignments.length === 0) return

  // ── Decrypt WhatsApp token once per org ─────────────────────────────────────
  let accessToken: string
  try {
    accessToken = await decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[homework-reminders] Token decryption failed', {
      org_id: orgId,
      error: String(err),
    })
    return
  }

  for (const assignment of assignments) {
    // ── Check dedup log ───────────────────────────────────────────────────────
    const { data: existing } = await db
      .from('notification_log')
      .select('id')
      .eq('organization_id', orgId)
      .eq('type', 'homework_reminder')
      .eq('entity_id', assignment.id)
      .maybeSingle()

    if (existing) continue // already notified

    // ── Resolve target phone: student phone → primary parent phone ────────────
    const phone = resolvePhone(assignment)
    if (!phone) {
      console.warn('[homework-reminders] No phone for assignment', {
        org_id: orgId,
        assignment_id: assignment.id,
      })
      await insertLog(db, orgId, assignment.id, 'failed', 'No phone found')
      continue
    }

    // ── Send reminder ─────────────────────────────────────────────────────────
    const message = `📚 תזכורת: שיעורי הבית "${assignment.title}" צריכים להיות מוכנים מחר (${assignment.due_date}).`

    let sendError: string | null = null
    try {
      await sendTextMessage(phone, message, accessToken, org.whatsapp_phone_number_id)
    } catch (err) {
      sendError = String(err)
      console.error('[homework-reminders] WhatsApp send failed', {
        org_id: orgId,
        assignment_id: assignment.id,
        error: sendError,
      })
    }

    // ── Log result ────────────────────────────────────────────────────────────
    await insertLog(db, orgId, assignment.id, sendError ? 'failed' : 'sent', sendError)
  }
}

/**
 * Resolves the notification target phone for an assignment.
 * Prefers student's own phone; falls back to primary parent phone.
 */
// deno-lint-ignore no-explicit-any
function resolvePhone(assignment: any): string | null {
  const student = assignment.students
  if (!student) return null

  if (student.phone) return student.phone as string

  const relationships = student.relationships ?? []
  for (const rel of relationships) {
    if (rel.is_primary && rel.parents?.phone) {
      return rel.parents.phone as string
    }
  }
  return null
}

// deno-lint-ignore no-explicit-any
async function insertLog(
  db: any,
  orgId: string,
  assignmentId: string,
  status: 'sent' | 'failed',
  errorMessage: string | null
): Promise<void> {
  const { error } = await db.from('notification_log').upsert(
    {
      organization_id: orgId,
      type:            'homework_reminder',
      entity_id:       assignmentId,
      status,
      error_message:   errorMessage,
      sent_at:         new Date().toISOString(),
    },
    { onConflict: 'organization_id,type,entity_id', ignoreDuplicates: false }
  )

  if (error) {
    console.error('[homework-reminders] Failed to insert notification_log', {
      org_id:        orgId,
      assignment_id: assignmentId,
      error:         error.message,
    })
  }
}
