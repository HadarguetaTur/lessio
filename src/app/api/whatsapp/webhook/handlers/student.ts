/**
 * Inbound handling for a student writing from their own phone.
 *
 * This path exists because the reminder Edge Functions already prefer
 * `students.phone` as the send target (homework-reminders, homework-sender) —
 * the bot was messaging students and then failing to recognise their replies.
 *
 * Scope is deliberately narrow: their own schedule, and their own homework.
 * Balance, cancellation, booking and the portal are parent concerns; see
 * ROLE_MENUS in @/lib/whatsapp/menu.
 */

import { hasHomeworkDoneIntent, hasScheduleIntent, sendTextMessage } from '@/lib/whatsapp'
import { botString } from '@/lib/whatsapp/strings'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { isActionAllowedForRole, type MenuAction } from '@/lib/whatsapp/menu'
import {
  buildUpcomingLessonLines,
  findOpenAssignments,
  formatHomeworkLines,
  markAssignmentDoneAndAlert,
  replyWith,
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

  if (menuAction === 'homework') {
    await sendHomeworkList(ctx, studentIds)
    return true
  }

  // Homework-done is checked before the schedule intent, unlike the parent path:
  // "סיימתי את השיעורים" matches the bare-שיעורים schedule keyword too, and for a
  // student answering the homework reminder we just sent them, done wins.
  if (!menuAction && hasHomeworkDoneIntent(ctx.msg.text)) {
    await markOwnHomeworkDone(ctx, studentIds)
    return true
  }

  if (menuAction === 'schedule' || (!menuAction && hasScheduleIntent(ctx.msg.text))) {
    await sendStudentSchedule(ctx, studentIds)
    return true
  }

  return false
}

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
