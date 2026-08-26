/**
 * Inbound handling for a student writing from their own phone.
 *
 * This path exists because the reminder Edge Functions already prefer
 * `students.phone` as the send target (homework-reminders, homework-sender) —
 * the bot was messaging students and then failing to recognise their replies.
 *
 * Scope: their own schedule, their own homework, and — since they are the one
 * who actually attends — booking and cancelling their own lessons. Both of
 * those run through their billing parent: the booking token carries a parent
 * id, a cancellation charge is created against a parent, and the parent is
 * copied on the confirmation. Balance and the portal stay parent-only; see
 * ROLE_MENUS in @/lib/whatsapp/menu.
 */

import {
  hasBookingIntent,
  hasCancellationIntent,
  hasHomeworkDoneIntent,
  hasScheduleIntent,
  sendNoEligibleLessonsReply,
  sendTextMessage,
} from '@/lib/whatsapp'
import { botString } from '@/lib/whatsapp/strings'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { sendLinkReply } from '@/lib/whatsapp/sendLinkReply'
import { isActionAllowedForRole, type MenuAction } from '@/lib/whatsapp/menu'
import { signBookingToken } from '@/lib/jwt'
import {
  deleteCancellationSession,
  getActiveCancellationSession,
} from '@/lib/cancellation-flow'
import {
  applyCancellationSelection,
  handleCancellationPayload,
  startCancellationFlow,
  type CancellationActor,
} from '../cancellation'
import {
  decodeCancellationPayload,
  type CancellationPayload,
} from '@/lib/whatsapp/cancellationPayloads'
import {
  buildUpcomingLessonLines,
  findBillingParent,
  findOpenAssignments,
  formatHomeworkLines,
  markAssignmentDoneAndAlert,
  replyWith,
  type BillingParent,
  type HandlerContext,
} from '../shared'

/** Routes a message from a student. Returns true when it was handled. */
export async function handleStudentMessage(
  ctx: HandlerContext,
  menuAction: MenuAction | null
): Promise<boolean> {
  if (ctx.sender.role !== 'student') return false
  const studentIds = [ctx.sender.studentId]

  // A tapped payload is client-supplied: a student could echo back "m:balance"
  // from a menu they were never shown.
  if (menuAction && !isActionAllowedForRole(menuAction, 'student')) {
    await replyWith(ctx, 'action_not_for_role')
    return false // caller re-sends the student's own menu
  }

  if (menuAction) {
    // An explicit tap outranks a cancellation list still open from an earlier
    // exchange — otherwise tapping "book a lesson" is read as a lesson number.
    await deleteCancellationSession(ctx.org.id, ctx.senderPhone).catch((err) => {
      console.warn('[whatsapp/webhook] Could not clear session on menu tap', {
        orgId: ctx.org.id,
        err,
      })
    })

    switch (menuAction) {
      case 'homework':
        await sendHomeworkList(ctx, studentIds)
        return true
      case 'book':
        await sendBookingLink(ctx)
        return true
      case 'cancel':
        await startCancellation(ctx)
        return true
      case 'schedule':
        await sendStudentSchedule(ctx, studentIds)
        return true
      default:
        return false
    }
  }

  // A tapped cancellation row or confirm button, ahead of the session for the
  // same reason a menu tap is: it is an explicit choice, not a lesson number.
  const cancelPayload = decodeCancellationPayload(ctx.msg.replyId)
  if (cancelPayload && ctx.org.automation_cancellation_enabled !== false) {
    await continueCancellationTap(ctx, cancelPayload)
    return true
  }

  // A bare number answers the lesson list we just sent, so the open session is
  // checked before any keyword — same precedence as the parent path.
  const session = await getActiveCancellationSession(ctx.org.id, ctx.senderPhone)
  if (session) {
    await continueCancellation(ctx, session)
    return true
  }

  // Homework-done is checked before the schedule intent, unlike the parent path:
  // "סיימתי את השיעורים" matches the bare-שיעורים schedule keyword too, and for a
  // student answering the homework reminder we just sent them, done wins.
  if (hasHomeworkDoneIntent(ctx.msg.text)) {
    await markOwnHomeworkDone(ctx, studentIds)
    return true
  }

  if (hasCancellationIntent(ctx.msg.text)) {
    await startCancellation(ctx)
    return true
  }

  if (hasBookingIntent(ctx.msg.text)) {
    await sendBookingLink(ctx)
    return true
  }

  if (hasScheduleIntent(ctx.msg.text)) {
    await sendStudentSchedule(ctx, studentIds)
    return true
  }

  return false
}

// ── Booking ───────────────────────────────────────────────────────────────────

/**
 * Sends the student a signed booking link for themselves.
 *
 * The token is signed with their billing parent, which is what makes the slot
 * they pick land on the right account — and is why the booking confirmation
 * afterwards goes to the parent's phone, not the student's.
 */
async function sendBookingLink(ctx: HandlerContext): Promise<void> {
  if (ctx.sender.role !== 'student') return

  const parent = await requireBillingParent(ctx)
  if (!parent) return

  const token = await signBookingToken({
    organizationId: ctx.org.id,
    parentId: parent.id,
    studentId: ctx.sender.studentId,
  })

  await sendLinkReply({
    orgId: ctx.org.id,
    to: ctx.senderPhone,
    templateType: 'booking_link',
    urlVar: 'booking_url',
    url: `${ctx.origin}/book/${token}`,
    buttonKey: 'cta_book_lesson',
    locale: ctx.locale,
    accessToken: ctx.accessToken,
    phoneNumberId: ctx.phoneNumberId,
  })

  console.info('[whatsapp/webhook] Booking link sent to student', {
    orgId: ctx.org.id,
    studentId: ctx.sender.studentId,
  })
}

// ── Cancellation ──────────────────────────────────────────────────────────────

/** The student cancels their own lesson; their parent carries the charge. */
function actorFor(ctx: HandlerContext, parent: BillingParent): CancellationActor {
  if (ctx.sender.role !== 'student') throw new Error('actorFor called off the student path')
  return {
    parentId: parent.id,
    studentIds: [ctx.sender.studentId],
    cancelledBy: 'student',
    copyTo: parent.phone ? { phone: parent.phone, locale: parent.locale } : null,
  }
}

async function startCancellation(ctx: HandlerContext): Promise<void> {
  if (ctx.org.automation_cancellation_enabled === false) {
    await sendNoEligibleLessonsReply(
      ctx.senderPhone,
      ctx.accessToken,
      ctx.phoneNumberId,
      ctx.locale
    )
    return
  }

  const parent = await requireBillingParent(ctx)
  if (!parent) return

  await startCancellationFlow({
    actor: actorFor(ctx, parent),
    orgId: ctx.org.id,
    senderPhone: ctx.senderPhone,
    timezone: ctx.timezone,
    accessToken: ctx.accessToken,
    phoneNumberId: ctx.phoneNumberId,
    locale: ctx.locale,
  })
}

async function continueCancellationTap(
  ctx: HandlerContext,
  payload: CancellationPayload
): Promise<void> {
  const parent = await requireBillingParent(ctx)
  if (!parent) return

  await handleCancellationPayload({
    actor: actorFor(ctx, parent),
    payload,
    orgId: ctx.org.id,
    senderPhone: ctx.senderPhone,
    timezone: ctx.timezone,
    accessToken: ctx.accessToken,
    phoneNumberId: ctx.phoneNumberId,
    locale: ctx.locale,
  })
}

async function continueCancellation(
  ctx: HandlerContext,
  session: { lesson_ids: string[] }
): Promise<void> {
  const parent = await requireBillingParent(ctx)
  if (!parent) return

  await applyCancellationSelection({
    actor: actorFor(ctx, parent),
    orgId: ctx.org.id,
    senderPhone: ctx.senderPhone,
    text: ctx.msg.text,
    session,
    timezone: ctx.timezone,
    accessToken: ctx.accessToken,
    phoneNumberId: ctx.phoneNumberId,
    locale: ctx.locale,
  })
}

/** Resolves the billing parent, or explains why booking and cancelling cannot run. */
async function requireBillingParent(ctx: HandlerContext): Promise<BillingParent | null> {
  if (ctx.sender.role !== 'student') return null

  const parent = await findBillingParent(ctx.db, ctx.org.id, ctx.sender.studentId)
  if (parent) return parent

  await replyWith(ctx, 'student_no_parent_linked')
  console.warn('[whatsapp/webhook] Student has no billing parent linked', {
    orgId: ctx.org.id,
    studentId: ctx.sender.studentId,
  })
  return null
}

// ── Schedule and homework ─────────────────────────────────────────────────────

async function sendStudentSchedule(ctx: HandlerContext, studentIds: string[]): Promise<void> {
  const lessonLines = await buildUpcomingLessonLines({
    db: ctx.db,
    orgId: ctx.org.id,
    studentIds,
    timezone: ctx.timezone,
    locale: ctx.locale,
  })

  // Same org-customisable template the parent gets — the body is written about
  // "the upcoming lessons", which reads correctly either way.
  const body = await resolveTemplate(
    ctx.org.id,
    'schedule_reply',
    { lesson_lines: lessonLines },
    ctx.locale
  )
  await sendTextMessage(ctx.senderPhone, body, ctx.accessToken, ctx.phoneNumberId)

  console.info('[whatsapp/webhook] Student schedule replied', {
    orgId: ctx.org.id,
    senderPhone: ctx.senderPhone,
  })
}

async function sendHomeworkList(ctx: HandlerContext, studentIds: string[]): Promise<void> {
  const assignments = await findOpenAssignments({ db: ctx.db, orgId: ctx.org.id, studentIds })

  if (assignments.length === 0) {
    await replyWith(ctx, 'student_no_homework')
    return
  }

  await replyWith(ctx, 'student_homework_list', {
    homework_lines: formatHomeworkLines(assignments, ctx.locale, ctx.timezone),
  })
}

async function markOwnHomeworkDone(ctx: HandlerContext, studentIds: string[]): Promise<void> {
  if (ctx.sender.role !== 'student') return

  const assignments = await findOpenAssignments({
    db: ctx.db,
    orgId: ctx.org.id,
    studentIds,
    limit: 1,
  })

  if (assignments.length === 0) {
    await replyWith(ctx, 'no_open_homework')
    return
  }

  const assignment = assignments[0]
  const studentName = ctx.sender.fullName ?? botString('the_student', ctx.locale)

  await markAssignmentDoneAndAlert({
    db: ctx.db,
    orgId: ctx.org.id,
    assignment,
    studentName,
    markedBy: 'student',
    accessToken: ctx.accessToken,
    phoneNumberId: ctx.phoneNumberId,
  })

  await replyWith(ctx, 'student_homework_marked', { title: assignment.title })

  console.info('[whatsapp/webhook] Homework marked done by student', {
    orgId: ctx.org.id,
    assignmentId: assignment.id,
  })
}
