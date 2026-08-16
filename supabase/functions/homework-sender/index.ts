/**
 * homework-sender — Supabase Edge Function
 * Per /docs/sprint-24-scope.md § Story 1.
 *
 * Trigger: scheduled cron, hourly (0 * * * *)
 *
 * Algorithm:
 *   1. Fetch homework_assignments where sent=false AND send_at <= now()
 *   2. Group by org
 *   3. For each assignment, send WhatsApp and mark sent=true
 *
 * Failures are isolated per assignment.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptToken } from '../_shared/crypto.ts'
import { sendSmartMessage } from '../_shared/whatsapp.ts'
import { resolveTemplate, resolveRecipientLocale } from '../_shared/templates.ts'
import { botString } from '../_shared/botStrings.ts'

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  // deno-lint-ignore no-explicit-any
  const db = createClient(supabaseUrl, serviceRoleKey) as any

  const now = new Date().toISOString()

  // ── 1. Fetch scheduled assignments ready to send ────────────────────────────
  const { data: assignments, error: asgError } = await db
    .from('homework_assignments')
    .select(`
      id,
      organization_id,
      title,
      body,
      due_date,
      student_id,
      students (
        phone,
        full_name,
        relationships (
          is_primary,
          parents ( phone, preferred_locale )
        )
      )
    `)
    .eq('sent', false)
    .not('send_at', 'is', null)
    .lte('send_at', now)
    .limit(200)

  if (asgError) {
    console.error('[homework-sender] Failed to fetch assignments', { error: asgError.message })
    return new Response('error fetching assignments', { status: 500 })
  }

  if (!assignments || assignments.length === 0) {
    return new Response('no assignments to send', { status: 200 })
  }

  // ── 2. Group by org for token decryption efficiency ─────────────────────────
  // deno-lint-ignore no-explicit-any
  const byOrg = new Map<string, any[]>()
  // deno-lint-ignore no-explicit-any
  for (const asg of assignments as any[]) {
    const orgId = asg.organization_id as string
    if (!byOrg.has(orgId)) byOrg.set(orgId, [])
    byOrg.get(orgId)!.push(asg)
  }

  for (const [orgId, orgAssignments] of byOrg) {
    // Fetch org WhatsApp config
    const { data: org } = await db
      .from('organizations')
      .select('whatsapp_phone_number_id, whatsapp_access_token, default_locale')
      .eq('id', orgId)
      .single()

    if (!org?.whatsapp_access_token || !org?.whatsapp_phone_number_id) {
      console.warn('[homework-sender] No WhatsApp config for org', { org_id: orgId })
      continue
    }

    let accessToken: string
    try {
      accessToken = await decryptToken(org.whatsapp_access_token)
    } catch (err) {
      console.error('[homework-sender] Token decryption failed', { org_id: orgId, error: String(err) })
      continue
    }

    // deno-lint-ignore no-explicit-any
    for (const assignment of orgAssignments as any[]) {
      try {
        const phone = resolvePhone(assignment)
        if (!phone) {
          console.warn('[homework-sender] No phone for assignment', {
            org_id: orgId,
            assignment_id: assignment.id,
          })
          // Still mark as sent to avoid retrying endlessly
          await markSent(db, assignment.id)
          continue
        }

        const locale = resolveRecipientLocale({
          stored: resolveParentLocale(assignment),
          orgDefault: org.default_locale,
        })
        const dueLabel = assignment.due_date
          ? `${botString('due_by', locale)}: ${assignment.due_date}`
          : botString('no_due_date', locale)

        const message = await resolveTemplate(db, orgId, 'homework_assignment', {
          title: assignment.title,
          body: assignment.body,
          due_line: assignment.due_date ? `\n${dueLabel}` : '',
        }, locale)

        // Approved-template params must match lessio_homework_assignment_*_v2
        // body order ({{1}}=title, {{2}}=body, {{3}}=due line) and must be
        // non-empty, newline-free strings (Meta API constraint).
        await sendSmartMessage(
          db,
          orgId,
          phone,
          accessToken,
          org.whatsapp_phone_number_id,
          'homework_assignment',
          message,
          [assignment.title, assignment.body, dueLabel],
          locale
        )

        await markSent(db, assignment.id)

        console.info('[homework-sender] Sent', { org_id: orgId, assignment_id: assignment.id })
      } catch (err) {
        console.error('[homework-sender] Failed to process assignment', {
          org_id: orgId,
          assignment_id: assignment.id,
          error: String(err),
        })
      }
    }
  }

  return new Response('ok', { status: 200 })
})

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

/** Primary parent's stored language, or null if unknown. */
// deno-lint-ignore no-explicit-any
function resolveParentLocale(assignment: any): string | null {
  const relationships = assignment.students?.relationships ?? []
  for (const rel of relationships) {
    if (rel.is_primary && rel.parents?.preferred_locale) {
      return rel.parents.preferred_locale as string
    }
  }
  return null
}

// deno-lint-ignore no-explicit-any
async function markSent(db: any, assignmentId: string): Promise<void> {
  const { error } = await db
    .from('homework_assignments')
    .update({ sent: true })
    .eq('id', assignmentId)

  if (error) {
    console.error('[homework-sender] Failed to mark sent', {
      assignment_id: assignmentId,
      error: error.message,
    })
  }
}
