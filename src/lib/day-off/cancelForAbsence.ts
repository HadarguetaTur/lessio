/**
 * Cancelling the lessons inside a teacher's absence, and telling the parents.
 *
 * Extracted from ./index so a partial-day block from the dashboard runs exactly
 * the same path as an approved day off from WhatsApp. Two implementations of
 * "cancel without charging" is precisely the drift that ends with a family
 * billed for their teacher's holiday.
 *
 * The absence is a UTC instant range rather than a pair of dates, which is what
 * lets it describe "Tuesday 08:00–12:00" as readily as "the 20th to the 22nd".
 *
 * Two rules are load-bearing and easy to break by reaching for the ordinary
 * cancellation helpers:
 *
 *   1. **No charge, ever.** A family does not pay for their teacher's absence.
 *      That means not calling the charge path AND not writing a cancellation
 *      event — the monthly billing engine counts those separately, so a waived
 *      charge with an event still lands on the invoice.
 *   2. **Service role only.** `guard_teacher_lesson_update()` blocks a
 *      teacher-role client from cancelling a lesson at all, so the caller must
 *      never hand its own RLS client in.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendTextMessage } from '@/lib/whatsapp'
import { sendTemplateWithQuickReplies } from '@/lib/whatsapp/interactive'
import { prepareBusinessSend } from '@/lib/whatsapp/consent'
import { LESSON_CANCELLED_BY_TEACHER_TEMPLATE } from '@/lib/whatsapp/approvedTemplates'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { botString } from '@/lib/whatsapp/strings'
import { encodeMenuPayload } from '@/lib/whatsapp/menu'
import { decryptToken } from '@/lib/crypto'
import { parseAppLocale, type AppLocale } from '@/lib/i18n/locale'

type Db = ReturnType<typeof createServiceRoleClient>

/** Free-text marker on the cancelled lessons, matching the 'ביטול סדרה' convention. */
export const CANCEL_REASON = 'TEACHER_DAY_OFF'

/** What Meta needs to be talked to on the org's behalf. */
export type SendContext = {
  orgId: string
  accessToken: string
  phoneNumberId: string
  timezone: string
}

/** A stretch of time a teacher is away — whole days, or part of one. */
export type AbsenceWindow = {
  orgId: string
  teacherId: string
  /** UTC ISO, half-open [gte, lt) */
  gte: string
  lt: string
  /** How the absence reads to a parent, e.g. "20/08–22/08" or "15/09, 08:00–12:00". */
  label: string
  teacherName: string | null
}

export type AffectedLesson = {
  lesson_students: Array<{
    student: {
      relationships: Array<{
        is_primary: boolean | null
        parent: { id: string; phone: string | null; preferred_locale: string | null } | null
      }> | null
    } | null
  }> | null
}

/** The teacher's name, or the generic noun when the profile has none. */
function teacherLabel(window: AbsenceWindow, locale: AppLocale): string {
  return window.teacherName?.trim() || botString('the_teacher', locale)
}

/**
 * Lessons that OVERLAP the window, not merely those that start inside it.
 * A lesson running 11:30–12:30 collides with a morning blocked until 12:00, and
 * filtering on start_at alone would leave it quietly in place.
 */
export async function loadAffectedLessons(
  db: Db,
  window: AbsenceWindow
): Promise<AffectedLesson[]> {
  const { data, error } = await db
    .from('lessons')
    .select(`
      id,
      lesson_students (
        student:students (
          relationships (
            is_primary,
            parent:parents ( id, phone, preferred_locale )
          )
        )
      )
    `)
    .eq('organization_id', window.orgId)
    .eq('teacher_id', window.teacherId)
    .eq('status', 'scheduled')
    .lt('start_at', window.lt)
    .gt('end_at', window.gte)

  if (error) {
    console.error('[absence] Failed to load affected lessons', { orgId: window.orgId, error })
    return []
  }

  return (data ?? []) as unknown as AffectedLesson[]
}

export async function cancelLessons(db: Db, window: AbsenceWindow): Promise<number> {
  const { data, error } = await db
    .from('lessons')
    .update({
      status: 'cancelled',
      cancel_reason: CANCEL_REASON,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', window.orgId)
    .eq('teacher_id', window.teacherId)
    .eq('status', 'scheduled')
    .lt('start_at', window.lt)
    .gt('end_at', window.gte)
    .select('id')

  if (error) {
    console.error('[absence] Failed to cancel lessons', { orgId: window.orgId, error })
    throw new Error('Failed to cancel lessons for a teacher absence')
  }

  // lesson_students rows are left alone, matching the dashboard cancel path.
  return (data ?? []).length
}

/**
 * One message per parent, not per lesson: a parent with two children taught by
 * the same teacher would otherwise get the same notice twice.
 */
export async function notifyParents(
  window: AbsenceWindow,
  ctx: SendContext,
  lessons: AffectedLesson[]
): Promise<{ notified: number; failed: number }> {
  const byParent = new Map<string, { phone: string; locale: AppLocale }>()

  for (const lesson of lessons) {
    for (const ls of lesson.lesson_students ?? []) {
      const relationships = ls.student?.relationships ?? []
      const primary = relationships.find((r) => r.is_primary) ?? relationships[0]
      const parent = primary?.parent
      if (!parent?.phone) continue
      if (byParent.has(parent.id)) continue
      byParent.set(parent.id, {
        phone: parent.phone,
        locale: parseAppLocale(parent.preferred_locale ?? undefined),
      })
    }
  }

  let notified = 0
  let failed = 0

  for (const [parentId, parent] of byParent) {
    const vars = {
      teacher_name: teacherLabel(window, parent.locale),
      date_range: window.label,
    }

    // Business-initiated: an opted-out parent is skipped (not a failure), and
    // a first-contact parent gets the welcome notice before the cancellation.
    const gate = await prepareBusinessSend({
      orgId: ctx.orgId,
      phone: parent.phone,
      accessToken: ctx.accessToken,
      phoneNumberId: ctx.phoneNumberId,
      locale: parent.locale,
    })
    if (!gate.ok) {
      console.info('[absence] Parent opted out — notice skipped', { orgId: ctx.orgId, parentId })
      continue
    }

    try {
      // The approved template carries the rebooking button. Its payload is
      // bound here rather than at registration, so the tap runs the ordinary
      // parent booking flow and mints a fresh link — a URL baked into the body
      // would be a 15-minute token that expired before anyone read it.
      //
      // A partial-day block deliberately reuses this same approved template
      // with an hours-bearing label: editing an approved template resets it to
      // PENDING at Meta, so new copy would cost days of review.
      const template =
        LESSON_CANCELLED_BY_TEACHER_TEMPLATE[parent.locale] ??
        LESSON_CANCELLED_BY_TEACHER_TEMPLATE.he

      await sendTemplateWithQuickReplies(
        parent.phone,
        {
          name: template.name,
          languageCode: template.languageCode,
          bodyParams: [vars.teacher_name, vars.date_range],
          payloads: [encodeMenuPayload('book')],
        },
        ctx.accessToken,
        ctx.phoneNumberId
      )
      notified++
    } catch (err) {
      // Most often the template is not approved at Meta yet. Text still reaches
      // anyone whose session window happens to be open.
      console.warn('[absence] Template notice failed — trying text', {
        orgId: ctx.orgId,
        parentId,
        error: String(err),
      })
      try {
        const body = await resolveTemplate(
          ctx.orgId,
          'lesson_cancelled_by_teacher',
          vars,
          parent.locale
        )
        await sendTextMessage(parent.phone, body, ctx.accessToken, ctx.phoneNumberId)
        notified++
      } catch (textErr) {
        // One unreachable parent must not cost the others their notice.
        failed++
        console.error('[absence] Could not notify parent', {
          orgId: ctx.orgId,
          parentId,
          error: String(textErr),
        })
      }
    }
  }

  return { notified, failed }
}

/**
 * The WhatsApp credentials for an org, for callers that did not arrive through
 * the webhook. Returns null when the org has not connected WhatsApp — the
 * cancellation must still happen, it just goes unannounced.
 */
export async function buildSendContext(orgId: string): Promise<SendContext | null> {
  const db = createServiceRoleClient()
  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_access_token, whatsapp_phone_number_id, timezone')
    .eq('id', orgId)
    .single()

  const encrypted = org?.whatsapp_access_token as string | null
  const phoneNumberId = org?.whatsapp_phone_number_id as string | null
  if (!encrypted || !phoneNumberId) return null

  try {
    return {
      orgId,
      accessToken: await decryptToken(encrypted),
      phoneNumberId,
      timezone: (org?.timezone as string) ?? 'Asia/Jerusalem',
    }
  } catch (err) {
    console.error('[absence] Could not decrypt the WhatsApp token', { orgId, err })
    return null
  }
}

/**
 * Load, cancel, then notify — in that order. After the update the
 * `status = 'scheduled'` filter no longer matches and the parents would be
 * unreachable.
 */
export async function cancelAndNotify(
  window: AbsenceWindow
): Promise<{ cancelled: number; notified: number; failed: number }> {
  // Service role, always: the caller's RLS client cannot cancel a lesson.
  const db = createServiceRoleClient()

  const affected = await loadAffectedLessons(db, window)
  const cancelled = await cancelLessons(db, window)

  const ctx = await buildSendContext(window.orgId)
  if (!ctx) {
    console.info('[absence] WhatsApp not connected — lessons cancelled unannounced', {
      orgId: window.orgId,
      cancelled,
    })
    return { cancelled, notified: 0, failed: 0 }
  }

  const { notified, failed } = await notifyParents(window, ctx, affected)
  return { cancelled, notified, failed }
}
