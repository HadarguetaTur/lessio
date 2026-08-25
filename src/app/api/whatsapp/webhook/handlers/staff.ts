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

import { hasScheduleIntent } from '@/lib/whatsapp'
import { isActionAllowedForRole, type MenuAction } from '@/lib/whatsapp/menu'
import { sendListMessage, sendReplyButtons } from '@/lib/whatsapp/interactive'
import { botString } from '@/lib/whatsapp/strings'
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
import { replyWith, type HandlerContext } from '../shared'

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
