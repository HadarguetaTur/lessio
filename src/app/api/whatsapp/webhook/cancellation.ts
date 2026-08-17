/**
 * The WhatsApp cancellation exchange: a numbered list of lessons, a reply with
 * a number, the lesson cancelled and everyone who needs to know told.
 *
 * Lifted out of route.ts so the student path can run the same flow instead of a
 * second, drifting copy. Two things are parameterised:
 *
 *   `studentIds` narrows the list. A student sees only their own lessons; a
 *   parent passes nothing and sees every child's.
 *
 *   `copyTo` adds a second recipient for the confirmation. A student cancels
 *   their own lesson but the charge lands on their parent, so the parent hears
 *   it from the bot rather than discovering it on the next invoice.
 *
 * Authorisation runs through the parent relationship either way:
 * getEligibleLessons and executeCancellation are both parent-scoped, and a
 * student's own id only ever narrows that set further — it cannot widen it.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  sendCancellationLessonList,
  sendInvalidSelectionReply,
  sendNoEligibleLessonsReply,
  sendTextMessage,
} from '@/lib/whatsapp'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { botString } from '@/lib/whatsapp/strings'
import { parseAppLocale, toIntlLocale, type AppLocale } from '@/lib/i18n/locale'
import {
  deleteCancellationSession,
  executeCancellation,
  formatLessonListMessage,
  getEligibleLessons,
  upsertCancellationSession,
  type EligibleLesson,
  type ExecuteCancellationResult,
} from '@/lib/cancellation-flow'

/** Who is cancelling, and on whose account. */
export type CancellationActor = {
  /** Whose relationship authorises the cancel, and who the charge lands on. */
  parentId: string
  /** Narrows the eligible list. Omitted, the parent sees every child's lessons. */
  studentIds?: string[]
  cancelledBy: 'parent' | 'student'
  /** Copied on the confirmation when the canceller is not the billed parent. */
  copyTo?: { phone: string; locale: AppLocale } | null
}

/** Everything needed to talk back to the person who wrote in. */
type Transport = {
  orgId: string
  senderPhone: string
  timezone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
}

/**
 * Opens the flow: sends the numbered list and stores the session that turns a
 * bare number into a lesson id for the next 10 minutes.
 */
export async function startCancellationFlow(
  params: Transport & { actor: CancellationActor }
): Promise<void> {
  const { orgId, senderPhone, accessToken, phoneNumberId, locale, actor } = params

  const lessons = await getEligibleLessons(orgId, actor.parentId, actor.studentIds)

  if (lessons.length === 0) {
    await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId, locale)
    return
  }

  await sendLessonList(params, lessons)
  console.info('[whatsapp/cancellation] Lesson list sent', {
    orgId,
    senderPhone,
    by: actor.cancelledBy,
  })
}

/**
 * Handles the reply to that list. An unusable pick keeps the flow open with a
 * freshly rebuilt list; a usable one cancels the lesson and notifies.
 */
export async function applyCancellationSelection(
  params: Transport & {
    actor: CancellationActor
    text: string
    session: { lesson_ids: string[] }
  }
): Promise<void> {
  const { orgId, senderPhone, timezone, accessToken, phoneNumberId, locale, actor, text, session } =
    params

  const num = parseInt(text.trim(), 10)
  const count = session.lesson_ids.length

  if (isNaN(num) || num < 1 || num > count) {
    // Invalid input — keep the flow open.
    await sendInvalidSelectionReply(senderPhone, accessToken, phoneNumberId, locale)
    await rebuildLessonList(params)
    return
  }

  const selectedLessonId = session.lesson_ids[num - 1]
  const outcome = await executeCancellation(selectedLessonId, actor.parentId, orgId)

  if (!outcome.success) {
    if (outcome.error === 'already_cancelled') {
      // Idempotency: already processed, close the flow silently.
      await deleteCancellationSession(orgId, senderPhone)
      return
    }

    await rebuildLessonList(params, botString('lesson_no_longer_cancellable', locale))
    return
  }

  // Success — the cancellation is committed. Nothing below may undo it.
  await deleteCancellationSession(orgId, senderPhone)

  try {
    await notifyCancelled({
      orgId,
      senderPhone,
      timezone,
      accessToken,
      phoneNumberId,
      locale,
      actor,
      outcome,
    })
  } catch (err) {
    console.error('[whatsapp/cancellation] Post-cancellation notifications failed after commit', {
      orgId,
      senderPhone,
      lessonId: selectedLessonId,
      err,
    })
  }

  console.info('[whatsapp/cancellation] Cancellation completed', {
    orgId,
    selectedLessonId,
    senderPhone,
    by: actor.cancelledBy,
  })
}

// ── Internals ─────────────────────────────────────────────────────────────────

/** Stores the session for a list and sends it. */
async function sendLessonList(
  params: Transport & { actor: CancellationActor },
  lessons: EligibleLesson[],
  prefix?: string
): Promise<void> {
  const { orgId, senderPhone, timezone, accessToken, phoneNumberId, locale } = params

  const body = formatLessonListMessage(lessons, timezone, locale)
  await upsertCancellationSession(
    orgId,
    senderPhone,
    lessons.map((l) => l.id)
  )
  await sendCancellationLessonList(
    senderPhone,
    prefix ? `${prefix}\n\n${body}` : body,
    accessToken,
    phoneNumberId
  )
}

/**
 * Re-sends the list after a rejected pick. The lessons are re-fetched rather
 * than reused: between the two messages one may have been cancelled elsewhere.
 * With nothing left, the flow closes instead of looping on an empty list.
 */
async function rebuildLessonList(
  params: Transport & { actor: CancellationActor },
  prefix?: string
): Promise<void> {
  const { orgId, senderPhone, accessToken, phoneNumberId, locale, actor } = params

  const lessons = await getEligibleLessons(orgId, actor.parentId, actor.studentIds)

  if (lessons.length === 0) {
    await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId, locale)
    await deleteCancellationSession(orgId, senderPhone)
    return
  }

  await sendLessonList(params, lessons, prefix)
}

/** Date and time of a lesson, in the reader's own language. */
function formatWhen(
  startAt: string,
  timezone: string,
  locale: AppLocale
): { date: string; time: string } {
  const intl = toIntlLocale(locale)
  const at = new Date(startAt)
  return {
    date: at.toLocaleDateString(intl, {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    time: at.toLocaleTimeString(intl, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  }
}

/** The charge line for the family's confirmation — empty when nothing was charged. */
function chargeLineFor(outcome: ExecuteCancellationResult, locale: AppLocale): string {
  const { chargeType, amount } = outcome.chargeResult
  if (!chargeType || amount <= 0) return ''
  const label = botString(chargeType === 'full' ? 'charge_full' : 'charge_partial', locale)
  return `\n${label}: ₪${amount.toFixed(2)}`
}

/**
 * Tells the canceller, the billed parent (when that is someone else) and the
 * org owner. Every send is best-effort: the lesson is already cancelled, and a
 * WhatsApp failure must not read as a failed cancellation.
 */
async function notifyCancelled(
  params: Transport & { actor: CancellationActor; outcome: ExecuteCancellationResult }
): Promise<void> {
  const { orgId, senderPhone, timezone, accessToken, phoneNumberId, locale, actor, outcome } = params

  // 1. The person who cancelled.
  const when = formatWhen(outcome.lessonStartAt, timezone, locale)
  const body = await resolveTemplate(
    orgId,
    'cancellation_confirmation',
    {
      student_name: outcome.studentName,
      teacher_name: outcome.teacherName,
      date: when.date,
      time: when.time,
      charge_line: chargeLineFor(outcome, locale),
    },
    locale
  )
  await sendTextMessage(senderPhone, body, accessToken, phoneNumberId).catch((err) => {
    console.error('[whatsapp/cancellation] Confirmation failed — cancellation committed', {
      orgId,
      senderPhone,
      err,
    })
  })

  // 2. The billed parent, when a student did the cancelling. They carry the
  //    charge, so they are told in their own language and told who did it.
  if (actor.copyTo && actor.copyTo.phone !== senderPhone) {
    const copyLocale = actor.copyTo.locale
    const copyWhen = formatWhen(outcome.lessonStartAt, timezone, copyLocale)
    const copyBody = await resolveTemplate(
      orgId,
      'cancellation_confirmation',
      {
        student_name: outcome.studentName,
        teacher_name: outcome.teacherName,
        date: copyWhen.date,
        time: copyWhen.time,
        charge_line: chargeLineFor(outcome, copyLocale),
      },
      copyLocale
    )
    const note = botString('cancelled_by_student_note', copyLocale, {
      student_name: outcome.studentName,
    })
    await sendTextMessage(
      actor.copyTo.phone,
      `${note}\n\n${copyBody}`,
      accessToken,
      phoneNumberId
    ).catch((err) => {
      console.error('[whatsapp/cancellation] Parent copy failed — cancellation committed', {
        orgId,
        err,
      })
    })
  }

  // 3. The org owner.
  const db = createServiceRoleClient()
  const { data: ownerProfile } = await db
    .from('profiles')
    .select('phone, preferred_locale')
    .eq('organization_id', orgId)
    .eq('role', 'owner')
    .eq('is_active', true)
    .maybeSingle()

  if (!ownerProfile?.phone) return

  // The admin alert goes to the owner — their own UI language, not the family's.
  const adminLocale = parseAppLocale((ownerProfile as { preferred_locale?: string }).preferred_locale)
  const adminWhen = formatWhen(outcome.lessonStartAt, timezone, adminLocale)

  const { chargeType, amount } = outcome.chargeResult
  const adminChargeLine =
    chargeType && amount > 0
      ? `\n${botString('charge_line_label', adminLocale)}: ₪${amount.toFixed(2)} (${botString(
          chargeType === 'full' ? 'charge_full' : 'charge_partial',
          adminLocale
        )})`
      : `\n${botString('charge_none', adminLocale)}`

  const adminBody = await resolveTemplate(
    orgId,
    'cancellation_admin_alert',
    {
      student_name: outcome.studentName,
      teacher_name: outcome.teacherName,
      date: adminWhen.date,
      time: adminWhen.time,
      charge_line: adminChargeLine,
      // The number that actually initiated it, so a call-back reaches the right
      // person — for a student cancellation that is the student, not the parent.
      parent_phone: senderPhone,
    },
    adminLocale
  )

  const adminMessage =
    actor.cancelledBy === 'student'
      ? `${botString('cancelled_by_student_note', adminLocale, {
          student_name: outcome.studentName,
        })}\n\n${adminBody}`
      : adminBody

  await sendTextMessage(ownerProfile.phone, adminMessage, accessToken, phoneNumberId).catch(
    (err) => {
      console.error('[whatsapp/cancellation] Admin alert failed', { orgId, err })
    }
  )
}
