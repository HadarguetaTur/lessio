/**
 * lesson-reminders — Supabase Edge Function
 * Per /docs/sprint-12-scope.md § Story 3
 *
 * Trigger: scheduled cron, every hour (0 * * * *)
 *
 * Algorithm:
 *   1. Fetch all orgs with reminders_enabled=true and a connected WhatsApp number
 *   2. For each org, find lessons starting within the reminder window
 *   3. For each lesson, check notification_log (dedup)
 *   4. Resolve the primary parent's phone via lesson_students → relationships
 *   5. Send WhatsApp reminder
 *   6. Insert notification_log row (sent or failed)
 *
 * Failures are isolated per org/lesson — one failure does not stop others.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptToken } from '../_shared/crypto.ts'
import { sendSmartMessage } from '../_shared/whatsapp.ts'
import { resolveTemplate, resolveRecipientLocale } from '../_shared/templates.ts'
import { botString } from '../_shared/botStrings.ts'
import { sendEmail } from '../_shared/email.ts'

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceRoleKey)

  // ── 1. Fetch orgs with reminders enabled + WhatsApp connected ────────────────
  // automation_lesson_reminder_enabled is the per-org WhatsApp-automations toggle
  // (Sprint 31); reminders_enabled remains the legacy master switch.
  const { data: orgs, error: orgsError } = await db
    .from('organizations')
    .select('id, timezone, lesson_reminder_hours, automation_lesson_reminder_hours, whatsapp_phone_number_id, whatsapp_access_token, email_notifications, default_locale')
    .eq('reminders_enabled', true)
    .eq('automation_lesson_reminder_enabled', true)
    .not('whatsapp_phone_number_id', 'is', null)
    .not('whatsapp_access_token', 'is', null)

  if (orgsError) {
    console.error('[lesson-reminders] Failed to fetch orgs', { error: orgsError.message })
    return new Response('error fetching orgs', { status: 500 })
  }

  if (!orgs || orgs.length === 0) {
    return new Response('no orgs to process', { status: 200 })
  }

  const now = new Date()

  for (const org of orgs) {
    try {
      await processOrg(db, org, now)
    } catch (err) {
      console.error('[lesson-reminders] Unhandled error for org', {
        org_id: org.id,
        error: String(err),
      })
    }
  }

  return new Response('ok', { status: 200 })
})

// deno-lint-ignore no-explicit-any
async function processOrg(db: any, org: any, now: Date) {
  const reminderHours: number =
    org.automation_lesson_reminder_hours ?? org.lesson_reminder_hours ?? 24

  // Window: lessons starting between (now + reminderHours) and (now + reminderHours + 1h)
  const windowStart = new Date(now.getTime() + reminderHours * 60 * 60 * 1000)
  const windowEnd   = new Date(windowStart.getTime() + 60 * 60 * 1000)

  // ── 2. Fetch lessons in window ──────────────────────────────────────────────
  const { data: lessons, error: lessonsError } = await db
    .from('lessons')
    .select(`
      id,
      start_at,
      teacher:teachers (
        profile:profiles ( full_name )
      ),
      lesson_students (
        student:students (
          relationships (
            is_primary,
            parent:parents ( id, phone, full_name, email, preferred_locale )
          )
        )
      )
    `)
    .eq('organization_id', org.id)
    .eq('status', 'scheduled')
    .gte('start_at', windowStart.toISOString())
    .lt('start_at', windowEnd.toISOString())

  if (lessonsError) {
    console.error('[lesson-reminders] Failed to fetch lessons', {
      org_id: org.id,
      error: lessonsError.message,
    })
    return
  }

  if (!lessons || lessons.length === 0) return

  // ── Decrypt WhatsApp token once per org ─────────────────────────────────────
  let accessToken: string
  try {
    accessToken = await decryptToken(org.whatsapp_access_token)
  } catch (err) {
    console.error('[lesson-reminders] Token decryption failed', {
      org_id: org.id,
      error: String(err),
    })
    return
  }

  for (const lesson of lessons) {
    // ── 3. Check dedup log ────────────────────────────────────────────────────
    const { data: existing } = await db
      .from('notification_log')
      .select('id')
      .eq('organization_id', org.id)
      .eq('type', 'lesson_reminder')
      .eq('entity_id', lesson.id)
      .maybeSingle()

    if (existing) continue // already sent

    // ── 4. Resolve primary parent phone ──────────────────────────────────────
    const phone = resolvePrimaryParentPhone(lesson)
    if (!phone) {
      console.warn('[lesson-reminders] No primary parent phone found', {
        org_id: org.id,
        lesson_id: lesson.id,
      })
      await insertLog(db, org.id, 'lesson_reminder', lesson.id, 'failed', 'No primary parent phone')
      continue
    }

    const locale = resolveRecipientLocale({
      stored: resolvePrimaryParentLocale(lesson),
      orgDefault: org.default_locale,
    })
    const intlLocale = locale === 'en' ? 'en-US' : 'he-IL'

    const teacherName: string =
      lesson.teacher?.profile?.full_name ?? botString('the_teacher', locale)

    const startAt = new Date(lesson.start_at)
    const timezone: string = org.timezone ?? 'Asia/Jerusalem'
    const timeStr = startAt.toLocaleTimeString(intlLocale, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const dateStr = startAt.toLocaleDateString(intlLocale, {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

    const message = await resolveTemplate(db, org.id, 'lesson_reminder', {
      teacher_name: teacherName,
      date: dateStr,
      time: timeStr,
    }, locale)

    // ── 5. Send WhatsApp message (session-window aware) ───────────────────────
    let sendError: string | null = null
    try {
      await sendSmartMessage(
        db,
        org.id,
        phone,
        accessToken,
        org.whatsapp_phone_number_id,
        'lesson_reminder',
        message,
        [teacherName, dateStr, timeStr],
        locale
      )
    } catch (err) {
      sendError = String(err)
      console.error('[lesson-reminders] WhatsApp send failed', {
        org_id: org.id,
        lesson_id: lesson.id,
        error: sendError,
      })
    }

    // ── 5b. Send email if enabled (Sprint 25) ─────────────────────────────────
    const emailSettings = (org.email_notifications ?? {}) as Record<string, boolean>
    const parentEmail = resolvePrimaryParentEmail(lesson)
    if (emailSettings.lesson_reminder && parentEmail) {
      await sendEmail({
        to: parentEmail,
        subject: `תזכורת שיעור — ${dateStr} בשעה ${timeStr}`,
        html: `<p>תזכורת: שיעור עם ${teacherName} ב${dateStr} בשעה ${timeStr}.</p>`,
      }).catch((err: unknown) => {
        console.error('[lesson-reminders] Email send failed', { org_id: org.id, lesson_id: lesson.id, error: String(err) })
      })
    }

    // ── 6. Insert notification log ────────────────────────────────────────────
    await insertLog(
      db,
      org.id,
      'lesson_reminder',
      lesson.id,
      sendError ? 'failed' : 'sent',
      sendError ?? null
    )
  }
}

/**
 * Walks lesson_students → relationships to find the primary parent's phone.
 * Returns the first phone found; for group lessons, picks the first primary parent.
 */
// deno-lint-ignore no-explicit-any
function resolvePrimaryParentPhone(lesson: any): string | null {
  const lessonStudents = lesson.lesson_students ?? []
  for (const ls of lessonStudents) {
    const relationships = ls.student?.relationships ?? []
    for (const rel of relationships) {
      if (rel.is_primary && rel.parent?.phone) {
        return rel.parent.phone as string
      }
    }
  }
  return null
}

/**
 * Same as resolvePrimaryParentPhone but returns the stored language.
 */
// deno-lint-ignore no-explicit-any
function resolvePrimaryParentLocale(lesson: any): string | null {
  const lessonStudents = lesson.lesson_students ?? []
  for (const ls of lessonStudents) {
    const relationships = ls.student?.relationships ?? []
    for (const rel of relationships) {
      if (rel.is_primary && rel.parent?.preferred_locale) {
        return rel.parent.preferred_locale as string
      }
    }
  }
  return null
}

/**
 * Same as resolvePrimaryParentPhone but returns email.
 */
// deno-lint-ignore no-explicit-any
function resolvePrimaryParentEmail(lesson: any): string | null {
  const lessonStudents = lesson.lesson_students ?? []
  for (const ls of lessonStudents) {
    const relationships = ls.student?.relationships ?? []
    for (const rel of relationships) {
      if (rel.is_primary && rel.parent?.email) {
        return rel.parent.email as string
      }
    }
  }
  return null
}

// deno-lint-ignore no-explicit-any
async function insertLog(
  db: any,
  orgId: string,
  type: string,
  entityId: string,
  status: 'sent' | 'failed',
  errorMessage: string | null
) {
  const { error } = await db.from('notification_log').upsert(
    {
      organization_id: orgId,
      type,
      entity_id: entityId,
      status,
      error_message: errorMessage,
      sent_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,type,entity_id', ignoreDuplicates: false }
  )

  if (error) {
    console.error('[lesson-reminders] Failed to insert notification_log', {
      org_id: orgId,
      entity_id: entityId,
      error: error.message,
    })
  }
}
