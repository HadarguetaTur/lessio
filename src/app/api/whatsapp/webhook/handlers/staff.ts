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
import { formatBotMoney } from '@/lib/i18n/formatCurrency'
import {
  askOwnerCopilot,
  classifyOwnerCopilotIntent,
  isOwnerCopilotWriteAction,
  OWNER_COPILOT_DAILY_CAP,
} from '@/lib/ai-assistant/copilot'
import { isAiAssistantConfigured } from '@/lib/ai-assistant'
import { isAiConfiguredForOrg } from '@/lib/ai-assistant/providers/factory'
import { countOwnerCopilotCalls } from '@/lib/ai-assistant/usage'
import { getCopilotAction } from '@/lib/ai-assistant/copilotActions/registry'
import type { CopilotActionRunCtx, CopilotOption } from '@/lib/ai-assistant/copilotActions/types'
import {
  cancelCopilotSession,
  claimCopilotSession,
  createCopilotSession,
  getCopilotSessionById,
  getLiveCopilotSession,
  setCopilotSessionResult,
  supersedeLiveCopilotSessions,
} from '@/lib/ai-assistant/copilotSessions'
import { assertOrgNotSaasReadOnly } from '@/lib/saas/subscriptions'
import {
  decodeCopilotPayload,
  encodeCopilotSessionPayload,
  type CopilotAction,
} from '@/lib/whatsapp/copilotPayloads'
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

/**
 * Where a collecting session keeps its disambiguation rows. Prefixed so it can
 * never collide with a real action param, and stripped before params reach an
 * action's strict schema.
 */
const OPTIONS_KEY = '__options'

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
    try {
      if (copilotDecision.action === 'confirm' || copilotDecision.action === 'cancel') {
        // A button minted before the session flow shipped, tapped now.
        await handleLegacyCopilotDecision(ctx, copilotDecision)
      } else {
        await handleCopilotSessionDecision(ctx, copilotDecision)
      }
    } catch (err) {
      // They tapped a button and are waiting: an unanswered tap reads as "it
      // sent", and Meta would redeliver the tap into the same failure.
      console.error('[whatsapp/staff] Copilot decision failed', {
        orgId: ctx.org.id,
        err: String(err),
      })
      await replyWith(ctx, 'copilot_error')
    }
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
    // cancellation session — and abandons an in-flight copilot proposal too.
    await deleteSupportSession(ctx.org.id, ctx.senderPhone)
    await supersedeLiveCopilotSessions(ctx.org.id, ctx.senderPhone)
  } else if (await handleSupportFreeText(ctx)) {
    return true
  } else if (await handleCopilotSessionFreeText(ctx)) {
    // Free text while a copilot proposal is open must be read against that
    // proposal ("no, to Ruti" is a correction) BEFORE the rule-based intents
    // below get a chance to swallow it — "יום שלישי" answering a slot question
    // must not be re-routed to the summary.
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

  // The copilot runs last: every rule-based intent above is answered exactly and
  // for free, and only what the rules do not recognise costs an LLM round-trip.
  if (!menuAction && (await handleOwnerCopilotFreeText(ctx))) {
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

/**
 * All gates that decide whether the copilot may spend a provider call on this
 * message. Returns the actor's profile id when it may, null when it may not.
 */
async function copilotGate(ctx: HandlerContext): Promise<string | null> {
  const actorProfileId = 'profileId' in ctx.sender ? ctx.sender.profileId : null
  if (!actorProfileId) return null

  // The same switch the parent path honours: turning the AI assistant off turns
  // the copilot off too, and an org with no key never reaches the provider.
  if (!ctx.org.ai_assistant_enabled) return null
  if (!(isAiAssistantConfigured() || (await isAiConfiguredForOrg(ctx.org.id)))) return null

  return actorProfileId
}

function copilotRunCtx(ctx: HandlerContext, actorProfileId: string): CopilotActionRunCtx {
  return {
    orgId: ctx.org.id,
    actorProfileId,
    locale: ctx.locale,
    timezone: ctx.timezone,
  }
}

function stripOptions(params: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...params }
  delete rest[OPTIONS_KEY]
  return rest
}

/** The Q&A fallback: when a write cannot be proposed, answer the message instead. */
async function answerInstead(ctx: HandlerContext): Promise<boolean> {
  const answer = await askOwnerCopilot(ctx.org.id, ctx.msg.text ?? '', ctx.locale, ctx.senderPhone)
  await sendTextMessage(ctx.senderPhone, answer, ctx.accessToken, ctx.phoneNumberId)
  return true
}

/** True when the daily budget is spent — and the person was told so. */
async function copilotCapReached(ctx: HandlerContext): Promise<boolean> {
  const calls = await countOwnerCopilotCalls(ctx.org.id, ctx.senderPhone)
  if (calls < OWNER_COPILOT_DAILY_CAP) return false
  await replyWith(ctx, 'copilot_limit_reached')
  return true
}

async function handleOwnerCopilotFreeText(ctx: HandlerContext): Promise<boolean> {
  if (ctx.msg.text == null || !ctx.msg.text.trim()) return false

  const actorProfileId = await copilotGate(ctx)
  if (!actorProfileId) return false
  if (await copilotCapReached(ctx)) return true

  const intent = await classifyOwnerCopilotIntent(ctx.org.id, ctx.msg.text, {
    actorPhone: ctx.senderPhone,
  })

  if (!intent || intent.action === 'unknown' || intent.action === 'cancel_session') {
    return false
  }

  try {
    if (intent.action === 'ask') return await answerInstead(ctx)
    if (isOwnerCopilotWriteAction(intent.action)) {
      return await proposeCopilotAction(ctx, actorProfileId, intent.action, intent.params)
    }
    return false
  } catch (err) {
    // Past this point the copilot has taken the message. Throwing would leave
    // the owner with no reply and Meta redelivering into the same failure.
    console.error('[whatsapp/staff] Owner copilot failed', { orgId: ctx.org.id, err: String(err) })
    await replyWith(ctx, 'copilot_error')
    return true
  }
}

/**
 * Free text while a copilot proposal is open. The classifier sees the pending
 * action, so the message can amend it, replace it, cancel it — or turn out to
 * be unrelated, in which case this returns false and normal routing continues
 * (the proposal stays open until its expiry).
 */
async function handleCopilotSessionFreeText(ctx: HandlerContext): Promise<boolean> {
  if (ctx.msg.text == null || !ctx.msg.text.trim()) return false

  const session = await getLiveCopilotSession(ctx.org.id, ctx.senderPhone)
  if (!session) return false

  const actorProfileId = await copilotGate(ctx)
  if (!actorProfileId) return false
  if (await copilotCapReached(ctx)) return true

  const intent = await classifyOwnerCopilotIntent(ctx.org.id, ctx.msg.text, {
    actorPhone: ctx.senderPhone,
    session: { action: session.action, params: stripOptions(session.params) },
  })

  if (!intent || intent.action === 'unknown') return false

  try {
    if (intent.action === 'cancel_session') {
      await cancelCopilotSession(session.id, ctx.org.id, ctx.senderPhone)
      await replyWith(ctx, 'copilot_cancelled')
      return true
    }
    if (intent.action === 'ask') return await answerInstead(ctx)
    if (isOwnerCopilotWriteAction(intent.action)) {
      // Same action: the message amends the pending params. A different
      // action: it replaces the proposal outright (propose supersedes).
      const merged =
        intent.action === session.action
          ? { ...stripOptions(session.params), ...intent.params }
          : intent.params
      return await proposeCopilotAction(ctx, actorProfileId, intent.action, merged)
    }
    return false
  } catch (err) {
    console.error('[whatsapp/staff] Copilot session turn failed', {
      orgId: ctx.org.id,
      err: String(err),
    })
    await replyWith(ctx, 'copilot_error')
    return true
  }
}

/**
 * Turns a classified write intent into a server-stored proposal. The AI's
 * involvement ended at classification: params are validated against the
 * action's strict schema, resolved org-scoped by deterministic code, and the
 * buttons carry only the session id — never the params themselves.
 */
async function proposeCopilotAction(
  ctx: HandlerContext,
  actorProfileId: string,
  actionName: string,
  rawParams: Record<string, unknown>
): Promise<boolean> {
  const def = getCopilotAction(actionName)
  if (!def) return false

  // Params the schema rejects are params the model made up. Answering the
  // message beats proposing an action built on invented input.
  const parsed = def.paramsSchema.safeParse(rawParams)
  if (!parsed.success) return await answerInstead(ctx)

  const runCtx = copilotRunCtx(ctx, actorProfileId)
  const proposal = await def.propose(runCtx, parsed.data)

  switch (proposal.kind) {
    case 'decline':
      return await answerInstead(ctx)

    case 'reply':
      await supersedeLiveCopilotSessions(ctx.org.id, ctx.senderPhone)
      await sendTextMessage(ctx.senderPhone, proposal.body, ctx.accessToken, ctx.phoneNumberId)
      return true

    case 'ask_slot':
      await createCopilotSession({
        orgId: ctx.org.id,
        phone: ctx.senderPhone,
        actorProfileId,
        action: def.name,
        sessionParams: proposal.params,
        status: 'collecting',
        locale: ctx.locale,
      })
      await sendTextMessage(ctx.senderPhone, proposal.body, ctx.accessToken, ctx.phoneNumberId)
      return true

    case 'ambiguous': {
      const sessionId = await createCopilotSession({
        orgId: ctx.org.id,
        phone: ctx.senderPhone,
        actorProfileId,
        action: def.name,
        sessionParams: { ...proposal.params, [OPTIONS_KEY]: proposal.options },
        status: 'collecting',
        locale: ctx.locale,
      })
      await sendListMessage(
        ctx.senderPhone,
        {
          body: proposal.body,
          buttonLabel: botString('copilot_pick_option', ctx.locale),
          rows: proposal.options.slice(0, 10).map((option, index) => ({
            id: encodeCopilotSessionPayload('pick', sessionId, index),
            title: option.title,
            description: option.description,
          })),
        },
        ctx.accessToken,
        ctx.phoneNumberId
      )
      return true
    }

    case 'confirm': {
      const sessionId = await createCopilotSession({
        orgId: ctx.org.id,
        phone: ctx.senderPhone,
        actorProfileId,
        action: def.name,
        sessionParams: parsed.data,
        status: 'awaiting_confirm',
        locale: ctx.locale,
      })
      await sendReplyButtons(
        ctx.senderPhone,
        {
          body: proposal.body,
          buttons: [
            {
              id: encodeCopilotSessionPayload('confirm', sessionId),
              title: botString('support_send_button', ctx.locale),
            },
            {
              id: encodeCopilotSessionPayload('cancel', sessionId),
              title: botString('support_cancel_button', ctx.locale),
            },
          ],
        },
        ctx.accessToken,
        ctx.phoneNumberId
      )
      return true
    }
  }
}

/**
 * Executes what the owner confirmed by tapping a button on a session proposal.
 *
 * There is no requireMutation() here on purpose: that guard reads a dashboard
 * session, and a webhook has none. The authority check on this path is the
 * staff role resolved from the sender's phone plus the explicit confirmation
 * tap — see docs/decisions.md, Amendment 2026-08-30. The webhook-side
 * equivalent of the lapsed-org gate is assertOrgNotSaasReadOnly below.
 */
async function handleCopilotSessionDecision(
  ctx: HandlerContext,
  payload:
    | { action: 'confirm_session'; sessionId: string }
    | { action: 'cancel_session'; sessionId: string }
    | { action: 'pick'; sessionId: string; index: number }
): Promise<void> {
  const actorProfileId = 'profileId' in ctx.sender ? ctx.sender.profileId : null
  if (!actorProfileId) {
    await replyWith(ctx, 'action_not_for_role')
    return
  }

  if (payload.action === 'cancel_session') {
    const cancelled = await cancelCopilotSession(payload.sessionId, ctx.org.id, ctx.senderPhone)
    await replyWith(ctx, cancelled ? 'copilot_cancelled' : 'copilot_session_expired')
    return
  }

  if (payload.action === 'pick') {
    const session = await getCopilotSessionById(payload.sessionId, ctx.org.id, ctx.senderPhone)
    const live =
      session &&
      (session.status === 'collecting' || session.status === 'awaiting_confirm') &&
      new Date(session.expires_at) > new Date()
    const options = live ? (session.params[OPTIONS_KEY] as CopilotOption[] | undefined) : undefined
    const option = Array.isArray(options) ? options[payload.index] : undefined

    if (!session || !option || typeof option.patch !== 'object' || option.patch === null) {
      await replyWith(ctx, 'copilot_session_expired')
      return
    }

    await proposeCopilotAction(ctx, actorProfileId, session.action, {
      ...stripOptions(session.params),
      ...option.patch,
    })
    return
  }

  // Confirm. A lapsed org is read-only from the webhook exactly as it is from
  // the dashboard.
  try {
    await assertOrgNotSaasReadOnly(ctx.org.id)
  } catch (err) {
    if (err instanceof Error && err.message === 'SAAS_READ_ONLY') {
      await replyWith(ctx, 'copilot_org_readonly')
      return
    }
    throw err
  }

  // The claim is the idempotency lock: only one tap flips awaiting_confirm to
  // executed, so a double-tap (or Meta redelivering the tap) runs nothing twice.
  const claimed = await claimCopilotSession(payload.sessionId, ctx.org.id, ctx.senderPhone)
  if (!claimed) {
    const session = await getCopilotSessionById(payload.sessionId, ctx.org.id, ctx.senderPhone)
    await replyWith(ctx, session?.status === 'executed' ? 'copilot_already_done' : 'copilot_session_expired')
    return
  }

  const def = getCopilotAction(claimed.action)
  const parsed = def?.paramsSchema.safeParse(stripOptions(claimed.params))
  if (!def || !parsed || !parsed.success) {
    // A stored action the registry no longer carries, or params that fail
    // today's schema — a stale row from an older deploy. Nothing ran.
    console.error('[whatsapp/staff] Claimed copilot session is not executable', {
      orgId: ctx.org.id,
      action: claimed.action,
    })
    await replyWith(ctx, 'copilot_error')
    return
  }

  const outcome = await def.execute(copilotRunCtx(ctx, actorProfileId), parsed.data)
  if (outcome.audit) {
    await setCopilotSessionResult(claimed.id, ctx.org.id, outcome.audit)
  }
  await sendTextMessage(ctx.senderPhone, outcome.body, ctx.accessToken, ctx.phoneNumberId)
}

/**
 * A confirm/cancel button minted before the session flow shipped. Decoding is
 * strict (per-action arity), and execution goes through the same registry defs
 * as the session path.
 */
async function handleLegacyCopilotDecision(
  ctx: HandlerContext,
  decision: { action: 'confirm' | 'cancel'; kind?: CopilotAction; parentId?: string }
): Promise<void> {
  const actorProfileId = 'profileId' in ctx.sender ? ctx.sender.profileId : null
  if (!actorProfileId) {
    await replyWith(ctx, 'action_not_for_role')
    return
  }

  if (decision.action === 'cancel' || !decision.kind) {
    await replyWith(ctx, 'copilot_cancelled')
    return
  }

  try {
    await assertOrgNotSaasReadOnly(ctx.org.id)
  } catch (err) {
    if (err instanceof Error && err.message === 'SAAS_READ_ONLY') {
      await replyWith(ctx, 'copilot_org_readonly')
      return
    }
    throw err
  }

  const def = getCopilotAction(decision.kind)
  const params = decision.parentId ? { parentId: decision.parentId } : {}
  const parsed = def?.paramsSchema.safeParse(params)
  if (!def || !parsed || !parsed.success) {
    await replyWith(ctx, 'copilot_error')
    return
  }

  const outcome = await def.execute(copilotRunCtx(ctx, actorProfileId), parsed.data)
  await sendTextMessage(ctx.senderPhone, outcome.body, ctx.accessToken, ctx.phoneNumberId)
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
    open_balance: formatBotMoney(openBalance, ctx.locale, (ctx.org.currency as string | null) ?? undefined),
  })

  console.info('[whatsapp/webhook] Staff summary replied', { orgId: ctx.org.id })
}
