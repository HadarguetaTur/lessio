/**
 * The WhatsApp cancellation exchange: an interactive list of lessons, a tap,
 * a confirm button, the lesson cancelled and everyone who needs to know told.
 *
 * Two input paths lead to the same commit:
 *
 *   Taps — `c:` payloads (see cancellationPayloads.ts), stateless: the lesson
 *   id rides in the payload and is re-validated on every step, so a tap still
 *   works after the session expired.
 *
 *   Typed numbers — the pre-interactive exchange, kept as the fallback when
 *   the interactive send fails and for parents answering an old numbered list.
 *   The session row (10-minute TTL) exists for this path alone.
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
import { sendListMessage, sendReplyButtons, type InteractiveRow } from '@/lib/whatsapp/interactive'
import {
  CANCEL_PAGE_SIZE,
  encodeCancellationPayload,
  type CancellationPayload,
} from '@/lib/whatsapp/cancellationPayloads'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { botString } from '@/lib/whatsapp/strings'
import { parseAppLocale, toIntlLocale, type AppLocale } from '@/lib/i18n/locale'
import { formatBotMoney } from '@/lib/i18n/formatCurrency'
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
  const { senderPhone, accessToken, phoneNumberId, locale, text, session } = params

  const num = parseInt(text.trim(), 10)
  const count = session.lesson_ids.length

  if (isNaN(num) || num < 1 || num > count) {
    // Invalid input — keep the flow open.
    await sendInvalidSelectionReply(senderPhone, accessToken, phoneNumberId, locale)
    await rebuildLessonList(params)
    return
  }

  await commitCancellation(params, session.lesson_ids[num - 1])
}

/**
 * Handles a tapped `c:` payload — a lesson row, a confirm button, a back-out
 * or a page turn. Stateless: every step re-validates the lesson against the
 * database, because a tap can arrive long after the list was sent.
 */
export async function handleCancellationPayload(
  params: Transport & { actor: CancellationActor; payload: CancellationPayload }
): Promise<void> {
  const { orgId, senderPhone, timezone, accessToken, phoneNumberId, locale, actor, payload } =
    params

  switch (payload.step) {
    case 'abort': {
      await deleteCancellationSession(orgId, senderPhone)
      await sendTextMessage(
        senderPhone,
        botString('cancel_flow_closed', locale),
        accessToken,
        phoneNumberId
      )
      return
    }

    case 'page': {
      const lessons = await getEligibleLessons(orgId, actor.parentId, actor.studentIds)
      if (lessons.length === 0) {
        await deleteCancellationSession(orgId, senderPhone)
        await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId, locale)
        return
      }
      // The list may have shrunk since the "more" row was sent — an offset that
      // now points past the end restarts from the first page instead of a blank.
      const offset = payload.offset < lessons.length ? payload.offset : 0
      await sendLessonList(params, lessons, { offset })
      return
    }

    case 'pick': {
      // Eligibility is re-checked through the same parent-scoped (and, for a
      // student, student-narrowed) query that built the list: the payload is
      // client-supplied, and the lesson may have been cancelled elsewhere.
      const lessons = await getEligibleLessons(orgId, actor.parentId, actor.studentIds)
      const lesson = lessons.find((l) => l.id === payload.lessonId)
      if (!lesson) {
        await rebuildLessonList(params, botString('lesson_no_longer_cancellable', locale))
        return
      }

      const when = formatWhen(lesson.start_at, timezone, locale)
      await sendReplyButtons(
        senderPhone,
        {
          body: botString('cancel_confirm_body', locale, {
            student_name: lesson.student_name,
            date: when.date,
            time: when.time,
          }),
          buttons: [
            {
              id: encodeCancellationPayload({ step: 'confirm', lessonId: lesson.id }),
              title: botString('cancel_confirm_yes', locale),
            },
            {
              id: encodeCancellationPayload({ step: 'abort' }),
              title: botString('cancel_confirm_no', locale),
            },
          ],
        },
        accessToken,
        phoneNumberId
      )
      return
    }

    case 'confirm': {
      // executeCancellation authorises through the parent relationship, which
      // for a student actor spans every sibling too — so the student narrowing
      // has to be enforced here, before the commit. The cost: a student's
      // double-tap rebuilds the list instead of closing silently.
      if (actor.studentIds) {
        const lessons = await getEligibleLessons(orgId, actor.parentId, actor.studentIds)
        if (!lessons.some((l) => l.id === payload.lessonId)) {
          await rebuildLessonList(params, botString('lesson_no_longer_cancellable', locale))
          return
        }
      }
      await commitCancellation(params, payload.lessonId)
      return
    }
  }
}

/**
 * The commit shared by both input paths: cancel, close the session, notify.
 */
async function commitCancellation(
  params: Transport & { actor: CancellationActor },
  selectedLessonId: string
): Promise<void> {
  const { orgId, senderPhone, timezone, accessToken, phoneNumberId, locale, actor } = params

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

/**
 * Sends the list of cancellable lessons as an interactive list and stores the
 * session behind it.
 *
 * The session holds every eligible lesson, not just the page on screen, so a
 * parent answering with a number — the text fallback, or an older list still in
 * their chat — indexes into the same order they were shown.
 *
 * A failed interactive send falls back to the numbered text list rather than
 * leaving the parent with nothing: some devices and some WABA states reject
 * interactive messages, and cancelling must not depend on that.
 */
async function sendLessonList(
  params: Transport & { actor: CancellationActor },
  lessons: EligibleLesson[],
  opts: { prefix?: string; offset?: number } = {}
): Promise<void> {
  const { orgId, senderPhone, timezone, accessToken, phoneNumberId, locale } = params
  const { prefix, offset = 0 } = opts

  await upsertCancellationSession(
    orgId,
    senderPhone,
    lessons.map((l) => l.id)
  )

  const page = lessons.slice(offset, offset + CANCEL_PAGE_SIZE)
  const rows: InteractiveRow[] = page.map((lesson) => {
    const when = formatWhen(lesson.start_at, timezone, locale)
    return {
      id: encodeCancellationPayload({ step: 'pick', lessonId: lesson.id }),
      title: `${lesson.student_name} · ${when.time}`,
      description: `${when.date} · ${lesson.teacher_name}`,
    }
  })

  const nextOffset = offset + CANCEL_PAGE_SIZE
  if (nextOffset < lessons.length) {
    rows.push({
      id: encodeCancellationPayload({ step: 'page', offset: nextOffset }),
      title: botString('cancel_list_more', locale),
    })
  }

  const header = botString('cancellation_list_header', locale)

  try {
    await sendListMessage(
      senderPhone,
      {
        body: prefix ? `${prefix}\n\n${header}` : header,
        buttonLabel: botString('cancel_list_button', locale),
        rows,
      },
      accessToken,
      phoneNumberId
    )
    return
  } catch (err) {
    console.warn('[whatsapp/cancellation] Interactive list failed — falling back to text', {
      orgId,
      senderPhone,
      err,
    })
  }

  const body = formatLessonListMessage(lessons, timezone, locale)
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

  await sendLessonList(params, lessons, { prefix })
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
  return `\n${label}: ${formatBotMoney(amount, locale)}`
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
      ? `\n${botString('charge_line_label', adminLocale)}: ${formatBotMoney(amount, adminLocale)} (${botString(
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
