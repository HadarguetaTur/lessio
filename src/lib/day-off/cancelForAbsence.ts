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
 *   1. **Whoever authorised the absence decides the price.** This used to read
 *      "no charge, ever", implemented as a raw bulk `UPDATE lessons SET
 *      status='cancelled'`. That made a teacher's *self-service* schedule
 *      exception (`/teacher/overrides`) a free, unapproved waiver of every fee
 *      the identical act one screen over (`/lessons/[id]` → `cancelLessonCore`
 *      with `actor.kind='teacher'`) charges under the org policy. Same actor,
 *      same lessons, two prices — the exact drift this module exists to stop.
 *
 *      Every cancellation here now goes through `cancelLessonCore`, and the
 *      *actor* carries the authority: owner/admin (a day-off **approval**, or
 *      an override an admin writes for a teacher) cancels as `staff` with
 *      `waive: true` — a family still does not pay for an approved absence —
 *      while a teacher closing her own diary cancels as `teacher`, which
 *      `cancelLessonCore` refuses to let waive (`waive = actor.kind ===
 *      'staff' && …`).
 *
 *      The old note that a waived charge "still lands on the invoice" via the
 *      cancellation event is stale: `calculateCancellationEventAmount` honours
 *      `policy_amount` (0 for a waived charge) before any legacy full-price
 *      fallback. Writing the event is now strictly better — it is the only
 *      audit record that a monthly org's lesson vanished from the bill on
 *      purpose.
 *   2. **Service role only.** `guard_teacher_lesson_update()` blocks a
 *      teacher-role client from cancelling a lesson at all, so the caller must
 *      never hand its own RLS client in. `cancelLessonCore` opens its own
 *      service-role client, so this holds by construction.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { cancelLessonCore } from '@/lib/cancellation-flow/cancelLessonCore'
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

/**
 * Who authorised this absence, and therefore what may be waived.
 *
 * `staff` is an owner/admin: a day-off **approval**, or an override an admin
 * writes on a teacher's page. `teacher_self` is a teacher closing her own
 * diary with nobody's sign-off — priced under the org cancellation policy,
 * exactly as her cancel button on the lesson page is.
 */
export type AbsenceAuthority = { kind: 'staff' } | { kind: 'teacher_self' }

/** A stretch of time a teacher is away — whole days, or part of one. */
export type AbsenceWindow = {
  orgId: string
  teacherId: string
  /**
   * Required. Defaulting it would reintroduce the bypass the first time a new
   * caller forgets — the whole point is that authority is never implicit.
   */
  authority: AbsenceAuthority
  /** UTC ISO, half-open [gte, lt) */
  gte: string
  lt: string
  /** How the absence reads to a parent, e.g. "20/08–22/08" or "15/09, 08:00–12:00". */
  label: string
  teacherName: string | null
}

export type AffectedLesson = {
  id: string
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

/**
 * Cancel every lesson in the window through the canonical core.
 *
 * One `cancelLessonCore` call per lesson rather than one bulk `UPDATE`: the
 * bulk update wrote no `student_cancellation_events` row, raised no charge and
 * consulted no policy, so it was a silent fee waiver reachable by the teacher
 * herself. Per-lesson is also what makes the roster, the billing parent and the
 * idempotent status-claim apply here at all.
 *
 * `lessonIds` is captured by `loadAffectedLessons` BEFORE anything moves — the
 * `status='scheduled'` filter stops matching the moment the first one lands.
 */
export async function cancelLessons(
  db: Db,
  window: AbsenceWindow,
  lessonIds?: string[]
): Promise<number> {
  const ids = lessonIds ?? (await loadAffectedLessons(db, window)).map((l) => l.id)
  if (ids.length === 0) return 0

  // An approved absence is free; a teacher's unapproved one is not. Only the
  // staff actor is even allowed to ask for the waiver — `cancelLessonCore`
  // drops `waive` for any other actor, so this cannot be spoofed by a caller
  // that passes the wrong authority.
  const actor =
    window.authority.kind === 'staff'
      ? ({ kind: 'staff' } as const)
      : ({ kind: 'teacher', teacherId: window.teacherId } as const)

  let cancelled = 0

  for (const lessonId of ids) {
    const outcome = await cancelLessonCore({
      lessonId,
      orgId: window.orgId,
      actor,
      source: 'teacher',
      reason: CANCEL_REASON,
      waive: window.authority.kind === 'staff',
    })

    if (outcome.success) {
      cancelled++
      continue
    }

    // `already_cancelled` is the ordinary racing/retry outcome and not worth a
    // line. Anything else means a lesson is still sitting inside a window the
    // calendar now says is closed, which a human has to see.
    if (outcome.error === 'already_cancelled') continue

    if (outcome.error === 'no_students') {
      // The core refuses an empty roster because there is nobody to bill. There
      // is also nobody to WRONG, and leaving it scheduled inside a blocked
      // window is worse — so this single case falls back to the plain status
      // move, with the reason marker intact.
      const { error } = await db
        .from('lessons')
        .update({
          status: 'cancelled',
          cancel_reason: CANCEL_REASON,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lessonId)
        .eq('organization_id', window.orgId)
        .eq('status', 'scheduled')
      if (!error) {
        cancelled++
        continue
      }
    }

    console.error('[absence] A lesson inside the absence could not be cancelled', {
      orgId: window.orgId,
      lessonId,
      error: outcome.error,
    })
  }

  // lesson_students rows are left alone, matching the dashboard cancel path.
  return cancelled
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
  const cancelled = await cancelLessons(db, window, affected.map((l) => l.id))

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
