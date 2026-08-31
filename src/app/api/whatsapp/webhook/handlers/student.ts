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
import { notifyIfWeeklyQuotaReached } from '../bookingQuotaNotice'
import {
  deleteCancellationSession,
  getActiveCancellationSession,
} from '@/lib/cancellation-flow'
import {
  startExamReportSession,
  advanceExamReportSession,
  getActiveExamReportSession,
  deleteExamReportSession,
  type ExamReportSession,
} from '@/lib/exam-report-flow/sessions'
import { DateTime } from 'luxon'
import { parseExamDate, isSkipWord } from '@/lib/exam-report-flow/parseExamDate'
import { createExamReport } from '@/lib/students/exams'
import { completeExamReportFollowUp } from '@/lib/exams/postReport'
import { downloadMedia, MediaTooLargeError } from '@/lib/whatsapp/media'
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
    // An explicit tap outranks any list or flow still open from an earlier
    // exchange — otherwise tapping "book a lesson" is read as a lesson number.
    await deleteCancellationSession(ctx.org.id, ctx.senderPhone).catch((err) => {
      console.warn('[whatsapp/webhook] Could not clear session on menu tap', {
        orgId: ctx.org.id,
        err,
      })
    })
    await deleteExamReportSession(ctx.org.id, ctx.senderPhone).catch((err) => {
      console.warn('[whatsapp/webhook] Could not clear exam session on menu tap', {
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
      case 'report_exam':
        await startExamReportSession(ctx.org.id, ctx.senderPhone, ctx.sender.studentId)
        await replyWith(ctx, 'exam_report_ask_subject')
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

  // An open exam-report session claims the next typed answer, before the
  // cancellation session and any keyword — it is the flow the student is
  // actively inside (starting either one deletes the other).
  const examSession = await getActiveExamReportSession(ctx.org.id, ctx.senderPhone)
  if (examSession) {
    await continueExamReport(ctx, examSession)
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

  // Warn when this week is already used up, then still send the link — the
  // calendar hides only the full week, so later weeks stay bookable.
  const quotaNotice = await notifyIfWeeklyQuotaReached({
    orgId: ctx.org.id,
    parentId: parent.id,
    studentId: ctx.sender.studentId,
    senderPhone: ctx.senderPhone,
    accessToken: ctx.accessToken,
    phoneNumberId: ctx.phoneNumberId,
    locale: ctx.locale,
  })

  const token = await signBookingToken({
    organizationId: ctx.org.id,
    parentId: parent.id,
    studentId: ctx.sender.studentId,
  })

  await sendLinkReply({
    orgId: ctx.org.id,
    to: ctx.senderPhone,
    templateType: quotaNotice.atQuota ? 'booking_next_week_link' : 'booking_link',
    urlVar: 'booking_url',
    url: `${ctx.origin}/book/${token}${quotaNotice.atQuota && quotaNotice.nextWeekStart ? `?week=${quotaNotice.nextWeekStart}` : ''}`,
    buttonKey: quotaNotice.atQuota ? 'cta_book_next_week' : 'cta_book_lesson',
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

// ── Exam report flow ──────────────────────────────────────────────────────────

/** Advances the four-step exam-report conversation on a typed answer. */
async function continueExamReport(ctx: HandlerContext, session: ExamReportSession): Promise<void> {
  const text = ctx.msg.text?.trim() ?? ''

  switch (session.step) {
    case 'awaiting_subject': {
      if (!text) {
        await replyWith(ctx, 'exam_report_ask_subject')
        return
      }
      await advanceExamReportSession(ctx.org.id, ctx.senderPhone, {
        step: 'awaiting_title',
        draft_subject: text.slice(0, 100),
      })
      await replyWith(ctx, 'exam_report_ask_title')
      return
    }

    case 'awaiting_title': {
      if (!text) {
        await replyWith(ctx, 'exam_report_ask_title')
        return
      }
      await advanceExamReportSession(ctx.org.id, ctx.senderPhone, {
        step: 'awaiting_date',
        draft_title: text.slice(0, 200),
      })
      await replyWith(ctx, 'exam_report_ask_date')
      return
    }

    case 'awaiting_date': {
      const examDate = parseExamDate(text, ctx.timezone)
      if (!examDate) {
        await replyWith(ctx, 'exam_report_invalid_date')
        return
      }
      await advanceExamReportSession(ctx.org.id, ctx.senderPhone, {
        step: 'awaiting_file',
        draft_exam_date: examDate,
      })
      await replyWith(ctx, 'exam_report_ask_file')
      return
    }

    case 'awaiting_file': {
      if (isSkipWord(text)) {
        await completeExamReport(ctx, session)
        return
      }
      // Typed something that is neither a file nor a skip — repeat the ask.
      await replyWith(ctx, 'exam_report_ask_file')
      return
    }
  }
}

/**
 * An inbound image or document from a student. Consumed only when an
 * exam-report session is waiting for a file; returns false otherwise so the
 * webhook can send its usual unsupported-media notice.
 */
export async function handleStudentExamMedia(ctx: HandlerContext): Promise<boolean> {
  if (ctx.sender.role !== 'student' || !ctx.msg.media) return false

  const session = await getActiveExamReportSession(ctx.org.id, ctx.senderPhone)
  if (!session || session.step !== 'awaiting_file') return false

  try {
    const { buffer, mimeType } = await downloadMedia(ctx.msg.media.id, ctx.accessToken)
    const fileName =
      ctx.msg.media.fileName ?? `exam-${session.draft_exam_date ?? 'file'}.${extensionFor(mimeType)}`
    await completeExamReport(ctx, session, { buffer, mimeType, fileName })
  } catch (err) {
    if (err instanceof MediaTooLargeError) {
      await replyWith(ctx, 'exam_report_file_too_large')
      return true
    }
    console.error('[whatsapp/webhook] Exam media download failed', {
      orgId: ctx.org.id,
      mediaId: ctx.msg.media.id,
      err,
    })
    // Save the report without the file rather than losing the whole flow.
    await completeExamReport(ctx, session)
  }
  return true
}

export async function completeExamReport(
  ctx: HandlerContext,
  session: ExamReportSession,
  file?: { buffer: Buffer; mimeType: string; fileName: string }
): Promise<void> {
  if (ctx.sender.role !== 'student') return
  if (!session.draft_subject || !session.draft_title || !session.draft_exam_date) {
    // A stale or half-filled row — restart cleanly.
    await deleteExamReportSession(ctx.org.id, ctx.senderPhone)
    await startExamReportSession(ctx.org.id, ctx.senderPhone, ctx.sender.studentId)
    await replyWith(ctx, 'exam_report_ask_subject')
    return
  }

  try {
    const exam = await createExamReport({
      orgId: ctx.org.id,
      studentId: session.student_id,
      source: 'student',
      input: {
        studentId: session.student_id,
        subject: session.draft_subject,
        title: session.draft_title,
        examDate: session.draft_exam_date,
      },
      file,
    })

    await deleteExamReportSession(ctx.org.id, ctx.senderPhone)
    await replyWith(ctx, 'exam_report_confirmed', {
      subject: exam.subject,
      exam_date: formatExamDate(exam.examDate, ctx.timezone),
    })

    // The route registers message processing with Next.js after(), so awaiting
    // here does not delay Meta's 200 response. It prevents nested work from
    // being abandoned when this handler resolves.
    await completeExamReportFollowUp({ orgId: ctx.org.id, exam })

    console.info('[whatsapp/webhook] Exam reported by student', {
      orgId: ctx.org.id,
      examId: exam.id,
      studentId: session.student_id,
    })
  } catch (err) {
    console.error('[whatsapp/webhook] Exam report failed', { orgId: ctx.org.id, err })
    await deleteExamReportSession(ctx.org.id, ctx.senderPhone)
    await replyWith(ctx, 'invalid_selection')
  }
}

function formatExamDate(isoDate: string, timezone: string): string {
  const dt = DateTime.fromISO(isoDate, { zone: timezone })
  return dt.isValid ? dt.toFormat('d/M') : isoDate
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'bin'
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
