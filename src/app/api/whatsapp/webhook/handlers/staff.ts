/**
 * Inbound handling for an org owner or admin writing to their own business
 * number.
 *
 * The real fix here is the negative one: before this path existed, an owner
 * texting their own number got "you are not registered with us", a lead row for
 * themselves, and a "new lead" notification pointing at /leads.
 *
 * Read-only except for one thing: deciding a teacher's day-off request. That is
 * the whole point of the approval gate — the teacher's request moves nothing
 * until someone with authority here taps approve.
 */

import { hasScheduleIntent, sendTextMessage } from '@/lib/whatsapp'
import { isActionAllowedForRole, type MenuAction } from '@/lib/whatsapp/menu'
import { sendListMessage, sendReplyButtons } from '@/lib/whatsapp/interactive'
import { botString } from '@/lib/whatsapp/strings'
import {
  askOwnerCopilot,
  classifyOwnerCopilotIntent,
  isOwnerCopilotWriteAction,
} from '@/lib/ai-assistant/copilot'
import { decodeCopilotPayload, encodeCopilotPayload } from '@/lib/whatsapp/copilotPayloads'
import { getDebtorsOverview } from '@/lib/charges/debtors'
import { sendDebtReminderForParent } from '@/lib/payment-request/sendManualReminder'
import {
  decodeStaffRequestPayload,
  encodeStaffRequestPayload,
  formatDateRange,
} from '@/lib/whatsapp/dayOffPayloads'
import {
  approveDayOffRequest,
  countLessonsInRange,
  getPendingRequests,
  getRequestById,
  rejectDayOffRequest,
  type ApproveOutcome,
  type DayOffRequest,
  type SendContext,
} from '@/lib/day-off'
import { OPEN_CHARGE_STATUSES, sumRemaining } from '@/lib/charges'
import { getTodayRange } from '@/lib/lessons'
import {
  startSupportSession,
  setSupportDraft,
  getActiveSupportSession,
  deleteSupportSession,
} from '@/lib/support/supportSessions'
import { createTicket } from '@/lib/support/tickets'
import { subjectFrom } from '@/lib/support/subject'
import { classifyTicketInBackground } from '@/lib/support/classify'
import { notifySuperadmins } from '@/lib/notifications'
import { replyWith, type HandlerContext } from '../shared'

/** Reply-button ids for the support confirmation step. */
const SUPPORT_SEND = 'sup:send'
const SUPPORT_CANCEL = 'sup:cancel'

/** Routes a message from an owner/admin. Returns true when it was handled. */
export async function handleStaffMessage(
  ctx: HandlerContext,
  menuAction: MenuAction | null
): Promise<boolean> {
  if (ctx.sender.role !== 'staff') return false

  if (menuAction && !isActionAllowedForRole(menuAction, 'staff')) {
    await replyWith(ctx, 'action_not_for_role')
    return false
  }

  // A decision on a day-off request. The id is client-supplied — that it exists
  // and belongs to this org is re-checked in the lib before anything is decided.
  const decision = decodeStaffRequestPayload(ctx.msg.replyId)
  if (decision) {
    await handleRequestDecision(ctx, decision.action, decision.requestId)
    return true
  }

  const copilotDecision = decodeCopilotPayload(ctx.msg.replyId)
  if (copilotDecision) {
    await handleOwnerCopilotDecision(ctx, copilotDecision)
    return true
  }

  // Support: the confirmation buttons first, then the menu tap, then free text
  // that belongs to an open session. Order matters — a tap on any menu row must
  // abandon an in-flight support request rather than be read as its description.
  if (ctx.msg.replyId === SUPPORT_SEND || ctx.msg.replyId === SUPPORT_CANCEL) {
    await handleSupportDecision(ctx, ctx.msg.replyId === SUPPORT_SEND)
    return true
  }

  if (menuAction === 'support') {
    await startSupportSession(ctx.org.id, ctx.senderPhone)
    await replyWith(ctx, 'support_prompt')
    return true
  }

  if (menuAction) {
    // Any other menu tap ends an open support request, exactly as it does for a
    // cancellation session.
    await deleteSupportSession(ctx.org.id, ctx.senderPhone)
  } else if (await handleSupportFreeText(ctx)) {
    return true
  } else if (await handleOwnerCopilotFreeText(ctx)) {
    return true
  }

  if (menuAction === 'pending_requests') {
    await sendPendingRequests(ctx)
    return true
  }

  if (menuAction === 'dashboard') {
    await replyWith(ctx, 'staff_dashboard_link', { url: `${ctx.origin}/dashboard` })
    return true
  }

  // A schedule-shaped question maps to the summary — an owner asking "what's
  // today" wants the numbers, not a lesson list.
  if (menuAction === 'today_summary' || (!menuAction && hasScheduleIntent(ctx.msg.text))) {
    await sendTodaySummary(ctx)
    return true
  }

  return false
}

// ── Support requests ──────────────────────────────────────────────────────────

/**
 * Free text while a support request is open.
 *
 * Returns true only when the message was consumed by the flow, so a staff
 * member with no open session keeps falling through to the summary intent.
 */
async function handleSupportFreeText(ctx: HandlerContext): Promise<boolean> {
  const session = await getActiveSupportSession(ctx.org.id, ctx.senderPhone)
  if (!session) return false

  if (session.step === 'awaiting_confirm') {
    // They typed instead of tapping. Treat it as a correction — replace the
    // draft and ask again, rather than filing the older text.
    const replacement = ctx.msg.text?.trim()
    if (!replacement) {
      await replyWith(ctx, 'support_empty_text')
      return true
    }
    await setSupportDraft(ctx.org.id, ctx.senderPhone, replacement)
    await askSupportConfirmation(ctx, replacement)
    return true
  }

  const text = ctx.msg.text?.trim()
  if (!text) {
    // An image or a sticker: the session stays open and we ask for words.
    await replyWith(ctx, 'support_empty_text')
    return true
  }

  await setSupportDraft(ctx.org.id, ctx.senderPhone, text)
  await askSupportConfirmation(ctx, text)
  return true
}

async function askSupportConfirmation(ctx: HandlerContext, text: string): Promise<void> {
  await sendReplyButtons(
    ctx.senderPhone,
    {
      body: botString('support_confirm', ctx.locale, { text: clipForConfirm(text) }),
      buttons: [
        { id: SUPPORT_SEND, title: botString('support_send_button', ctx.locale) },
        { id: SUPPORT_CANCEL, title: botString('support_cancel_button', ctx.locale) },
      ],
    },
    ctx.accessToken,
    ctx.phoneNumberId
  )
}

/**
 * Meta caps an interactive body at 1024 characters, and the confirmation wraps
 * the draft in a sentence. Echoing a long report back in full would fail the
 * send outright, so the echo is trimmed — the ticket still carries everything.
 */
function clipForConfirm(text: string): string {
  return text.length <= 600 ? text : text.slice(0, 600) + '…'
}

async function handleSupportDecision(ctx: HandlerContext, send: boolean): Promise<void> {
  const session = await getActiveSupportSession(ctx.org.id, ctx.senderPhone)

  if (!send) {
    await deleteSupportSession(ctx.org.id, ctx.senderPhone)
    await replyWith(ctx, 'support_cancelled')
    return
  }

  // Expired between typing and tapping, or a stale button from an old thread.
  if (!session?.draft_text) {
    await deleteSupportSession(ctx.org.id, ctx.senderPhone)
    await replyWith(ctx, 'support_prompt')
    await startSupportSession(ctx.org.id, ctx.senderPhone)
    return
  }

  const body = session.draft_text
  const ticketId = await createTicket({
    orgId: ctx.org.id,
    createdBy: ctx.sender.role === 'staff' ? ctx.sender.profileId : null,
    subject: subjectFrom(body),
    body,
    source: 'whatsapp',
  })

  // Clear the session either way: a failed insert must not leave them stuck in
  // a confirmation loop with a button that keeps failing.
  await deleteSupportSession(ctx.org.id, ctx.senderPhone)

  if (!ticketId) {
    await replyWith(ctx, 'support_empty_text')
    return
  }

  classifyTicketInBackground(ticketId, subjectFrom(body), body)

  await notifySuperadmins(
    'support_ticket_new',
    subjectFrom(body),
    ctx.org.name ?? ctx.org.id,
    `/admin/support/${ticketId}`
  )

  await replyWith(ctx, 'support_created')
}

async function handleOwnerCopilotFreeText(ctx: HandlerContext): Promise<boolean> {
  if (ctx.msg.text == null || !ctx.msg.text.trim()) return false

  const intent = await classifyOwnerCopilotIntent(ctx.org.id, ctx.msg.text)

  if (!intent || intent.action === 'unknown') {
    return false
  }

  if (intent.action === 'ask') {
    const answer = await askOwnerCopilot(ctx.org.id, ctx.msg.text, ctx.locale)
    await sendTextMessage(ctx.senderPhone, answer, ctx.accessToken, ctx.phoneNumberId)
    return true
  }

  if (isOwnerCopilotWriteAction(intent.action)) {
    const ownerCopilotRegistry = {
      send_debt_reminder_all: async () => {
        const overview = await getDebtorsOverview(ctx.org.id)
        const eligible = overview.rows.filter((row) => !row.optedOut)

        if (eligible.length === 0) {
          await sendTextMessage(
            ctx.senderPhone,
            botString('balance_none', ctx.locale),
            ctx.accessToken,
            ctx.phoneNumberId
          )
          return true
        }

        await sendReplyButtons(
          ctx.senderPhone,
          {
            body: `שלח תזכורת ל-${eligible.length} חייבים?`,
            buttons: [
              {
                id: encodeCopilotPayload('confirm', 'send_debt_reminder_all'),
                title: botString('support_send_button', ctx.locale),
              },
              {
                id: encodeCopilotPayload('cancel'),
                title: botString('support_cancel_button', ctx.locale),
              },
            ],
          },
          ctx.accessToken,
          ctx.phoneNumberId
        )
        return true
      },
      send_debt_reminder_parent: async () => {
        if (!intent.parentId) {
          const answer = await askOwnerCopilot(ctx.org.id, ctx.msg.text, ctx.locale)
          await sendTextMessage(ctx.senderPhone, answer, ctx.accessToken, ctx.phoneNumberId)
          return true
        }

        const overview = await getDebtorsOverview(ctx.org.id)
        const parent = overview.rows.find((row) => row.parentId === intent.parentId)

        if (!parent || parent.optedOut) {
          const answer = await askOwnerCopilot(ctx.org.id, ctx.msg.text, ctx.locale)
          await sendTextMessage(ctx.senderPhone, answer, ctx.accessToken, ctx.phoneNumberId)
          return true
        }

        await sendReplyButtons(
          ctx.senderPhone,
          {
            body: `לשלוח תזכורת ל-${parent.parentName || 'ההורה'}?`,
            buttons: [
              {
                id: encodeCopilotPayload('confirm', 'send_debt_reminder_parent', intent.parentId),
                title: botString('support_send_button', ctx.locale),
              },
              {
                id: encodeCopilotPayload('cancel'),
                title: botString('support_cancel_button', ctx.locale),
              },
            ],
          },
          ctx.accessToken,
          ctx.phoneNumberId
        )
        return true
      },
    } as const

    return await ownerCopilotRegistry[intent.action]()
  }

  return false
}

async function handleOwnerCopilotDecision(
  ctx: HandlerContext,
  decision: { action: 'confirm' | 'cancel'; kind?: 'send_debt_reminder_all' | 'send_debt_reminder_parent'; parentId?: string }
): Promise<void> {
  if (decision.action === 'cancel') {
    await replyWith(ctx, 'support_cancelled')
    return
  }

  if (decision.kind === 'send_debt_reminder_all') {
    const overview = await getDebtorsOverview(ctx.org.id)
    const eligible = overview.rows.filter((row) => !row.optedOut)

    await Promise.all(
      eligible.map((row) => sendDebtReminderForParent(ctx.org.id, row.parentId, ctx.sender.profileId))
    )
    return
  }

  if (decision.kind === 'send_debt_reminder_parent' && decision.parentId) {
    await sendDebtReminderForParent(ctx.org.id, decision.parentId, ctx.sender.profileId)
  }
}

// ── Day-off requests ──────────────────────────────────────────────────────────

function sendContext(ctx: HandlerContext): SendContext {
  return {
    orgId: ctx.org.id,
    accessToken: ctx.accessToken,
    phoneNumberId: ctx.phoneNumberId,
    timezone: ctx.timezone,
  }
}

async function sendPendingRequests(ctx: HandlerContext): Promise<void> {
  const requests = await getPendingRequests(ctx.org.id)

  if (requests.length === 0) {
    await replyWith(ctx, 'staff_no_pending_requests')
    return
  }

  await sendListMessage(
    ctx.senderPhone,
    {
      body: botString('staff_pending_list_body', ctx.locale),
      buttonLabel: botString('staff_pending_list_button', ctx.locale),
      rows: requests.map((r) => ({
        id: encodeStaffRequestPayload('show', r.id),
        title: r.teacherName?.trim() || botString('the_teacher', ctx.locale),
        description: formatDateRange(r.startDate, r.endDate, ctx.timezone),
      })),
    },
    ctx.accessToken,
    ctx.phoneNumberId
  )
}

async function handleRequestDecision(
  ctx: HandlerContext,
  action: 'show' | 'approve' | 'reject',
  requestId: string
): Promise<void> {
  if (ctx.sender.role !== 'staff') return

  if (action === 'show') {
    await sendRequestDetail(ctx, requestId)
    return
  }

  const outcome =
    action === 'approve'
      ? await approveDayOffRequest({
          requestId,
          decidedByProfileId: ctx.sender.profileId,
          ctx: sendContext(ctx),
        })
      : await rejectDayOffRequest({
          requestId,
          decidedByProfileId: ctx.sender.profileId,
          ctx: sendContext(ctx),
        })

  await replyWithOutcome(ctx, outcome)
}

/** Shows one request with what approving it would cost, then the two buttons. */
async function sendRequestDetail(ctx: HandlerContext, requestId: string): Promise<void> {
  const request = await getRequestById(ctx.org.id, requestId)

  if (!request) {
    await replyWith(ctx, 'staff_request_not_found')
    return
  }

  if (request.status !== 'pending') {
    await replyWith(ctx, 'staff_request_already_decided')
    return
  }

  const lessons = await countLessonsInRange(
    ctx.org.id,
    request.teacherId,
    request.startDate,
    request.endDate,
    ctx.timezone
  )

  await sendReplyButtons(
    ctx.senderPhone,
    {
      body: botString('staff_request_detail', ctx.locale, {
        teacher_name: teacherLabel(ctx, request),
        date_range: formatDateRange(request.startDate, request.endDate, ctx.timezone),
        lessons: String(lessons),
      }),
      buttons: [
        {
          id: encodeStaffRequestPayload('approve', request.id),
          title: botString('staff_approve_button', ctx.locale),
        },
        {
          id: encodeStaffRequestPayload('reject', request.id),
          title: botString('staff_reject_button', ctx.locale),
        },
      ],
    },
    ctx.accessToken,
    ctx.phoneNumberId
  )
}

async function replyWithOutcome(ctx: HandlerContext, outcome: ApproveOutcome): Promise<void> {
  switch (outcome.status) {
    case 'approved':
      await replyWith(ctx, 'staff_request_approved', {
        lessons: String(outcome.lessonsCancelled),
        parents: String(outcome.parentsNotified),
      })
      return
    case 'rejected':
      await replyWith(ctx, 'staff_request_rejected', {
        teacher_name: teacherLabel(ctx, outcome.request),
      })
      return
    case 'stale':
      await replyWith(ctx, 'staff_request_stale')
      return
    case 'already_decided':
      // The other admin got there first — their approval already ran.
      await replyWith(ctx, 'staff_request_already_decided')
      return
    case 'not_found':
      await replyWith(ctx, 'staff_request_not_found')
      return
  }
}

function teacherLabel(ctx: HandlerContext, request: DayOffRequest): string {
  return request.teacherName?.trim() || botString('the_teacher', ctx.locale)
}

async function sendTodaySummary(ctx: HandlerContext): Promise<void> {
  const { gte, lt } = getTodayRange(ctx.timezone)

  const [lessonsRes, cancelledRes, chargesRes] = await Promise.all([
    ctx.db
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.org.id)
      .neq('status', 'cancelled')
      .gte('start_at', gte)
      .lt('start_at', lt),
    ctx.db
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.org.id)
      .eq('status', 'cancelled')
      .gte('start_at', gte)
      .lt('start_at', lt),
    ctx.db
      .from('charges')
      .select('amount, amount_paid')
      .eq('organization_id', ctx.org.id)
      .in('status', [...OPEN_CHARGE_STATUSES]),
  ])

  if (lessonsRes.error || cancelledRes.error || chargesRes.error) {
    console.error('[whatsapp/webhook] Staff summary DB error', {
      orgId: ctx.org.id,
      error: lessonsRes.error ?? cancelledRes.error ?? chargesRes.error,
    })
    throw new Error('Failed to load staff daily summary')
  }

  const openBalance = sumRemaining(
    (chargesRes.data ?? []) as Array<{ amount: number; amount_paid: number | null }>
  )

  await replyWith(ctx, 'staff_summary_body', {
    lessons_today: String(lessonsRes.count ?? 0),
    cancellations_today: String(cancelledRes.count ?? 0),
    open_balance: openBalance.toFixed(2),
  })

  console.info('[whatsapp/webhook] Staff summary replied', { orgId: ctx.org.id })
}
