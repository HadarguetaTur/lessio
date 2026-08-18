/**
 * WhatsApp webhook route handler.
 *
 * GET  /api/whatsapp/webhook — Meta hub verification challenge
 * POST /api/whatsapp/webhook — Incoming message handler
 *
 * Per /docs/sprint-1-scope.md § WhatsApp webhook foundation.
 * Per /docs/sprint-1-scope.md § Parent identification.
 * Per /docs/sprint-1-scope.md § Booking link generation and dispatch.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import { signBookingToken } from '@/lib/jwt'
import { decryptToken } from '@/lib/crypto'
import {
  sendUnknownParentReply,
  sendNoEligibleLessonsReply,
  sendTextMessage,
  parseWebhookPayload,
  hasBookingIntent,
  hasCancellationIntent,
  hasHomeworkDoneIntent,
  hasBalanceIntent,
  hasScheduleIntent,
  hasReceiptIntent,
  hasPortalIntent,
  hasOptOutIntent,
  hasResumeIntent,
} from '@/lib/whatsapp'
import { parseTemplateStatusUpdates, type TemplateStatusUpdate } from '@/lib/whatsapp/parsePayload'
import { upsertTemplateStatus } from '@/lib/whatsapp/templateStatus'
import { isOptedOut, setParentOptOut } from '@/lib/whatsapp/optOut'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { sendLinkReply } from '@/lib/whatsapp/sendLinkReply'
import { resolvePaymentLine, sumOpenCharges } from '@/lib/whatsapp/balance'
import { botString } from '@/lib/whatsapp/strings'
import {
  decodeMenuPayload,
  decodeRolePayload,
  isActionAllowedForRole,
  isGreeting,
  needsStudent,
  sendMainMenu,
  sendRolePicker,
  sendStudentPicker,
  type MenuAction,
} from '@/lib/whatsapp/menu'
import {
  resolveSender,
  setSenderPreference,
  type KnownSenderRole,
  type ResolvedSender,
} from '@/lib/whatsapp/sender'
import { handleStudentMessage } from './handlers/student'
import { handleTeacherMessage } from './handlers/teacher'
import { handleStaffMessage } from './handlers/staff'
import {
  buildUpcomingLessonLines,
  findOpenAssignments,
  markAssignmentDoneAndAlert,
  studentDisplayName,
  type HandlerContext,
} from './shared'
import {
  detectLocaleFromText,
  resolveRecipientLocale,
  type AppLocale,
} from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import {
  isDemoRescheduleEnabled,
  hasRescheduleIntent,
  handleRescheduleIntent,
} from '@/lib/whatsapp/demoReschedule'
import { upsertLead } from '@/lib/leads'
import {
  getActiveCancellationSession,
  deleteCancellationSession,
} from '@/lib/cancellation-flow'
import { applyCancellationSelection, startCancellationFlow } from './cancellation'
import { aiAssistant, isAiAssistantConfigured } from '@/lib/ai-assistant'
import { isAiConfiguredForOrg } from '@/lib/ai-assistant/providers/factory'
import { findRecentUsageLog, updateSatisfaction } from '@/lib/ai-assistant/usage'
import { logExchange } from '@/lib/ai-assistant/conversationLog'
import { DateTime } from 'luxon'
import { claimIncomingMessage, releaseIncomingMessageClaim, isRateLimited } from '@/lib/whatsapp/idempotency'
import {
  notifyMultiple,
  getOwnerAndAdminProfileIds,
  notifySuperadmins,
  hasRecentUnreadSuperadminNotification,
} from '@/lib/notifications'
import * as Sentry from '@sentry/nextjs'

// Message processing continues after the response via after(); allow up to 60s
// for DB lookups, AI-assistant calls, and outbound WhatsApp sends.
export const maxDuration = 60

// ── GET — Meta hub verification ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// ── POST — incoming message handler ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Read raw body for HMAC verification
  const rawBody = await request.text()

  // 2. Validate X-Hub-Signature-256
  const signature = request.headers.get('x-hub-signature-256')
  const appSecret = process.env.WHATSAPP_APP_SECRET

  if (!appSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[whatsapp/webhook] WHATSAPP_APP_SECRET not set in production')
      return new NextResponse('Server Misconfigured', { status: 500 })
    }

    // Local dev/test fallback only. Production must always verify signatures.
    console.warn('[whatsapp/webhook] WHATSAPP_APP_SECRET not set — skipping signature check')
  } else if (!verifySignature(rawBody, signature, appSecret)) {
    console.error('[whatsapp/webhook] Invalid X-Hub-Signature-256 — rejecting request')
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // 3. Parse payload — always return 200 after this point (Meta requires immediate 200)
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    console.error('[whatsapp/webhook] Failed to parse JSON body')
    return new NextResponse('OK', { status: 200 })
  }

  const messages = parseWebhookPayload(body)
  const templateStatusUpdates = parseTemplateStatusUpdates(body)

  // Process messages in the background so Meta gets its 200 immediately —
  // slow handlers (AI assistant, outbound sends) must not delay the ack,
  // or Meta retries and eventually disables the webhook.
  const origin = new URL(request.url).origin
  const work = (async () => {
    // Errors are caught individually to avoid dropping other messages
    for (const msg of messages) {
      await processMessage(msg, origin).catch(err => {
        console.error('[whatsapp/webhook] Error processing message', { messageId: msg.messageId, err })
      })
    }

    for (const update of templateStatusUpdates) {
      await recordTemplateStatusUpdate(update).catch(err => {
        console.error('[whatsapp/webhook] Error recording template status', {
          templateName: update.templateName,
          err,
        })
      })
    }
  })()

  try {
    after(work)
  } catch {
    // Outside a Next.js request scope (vitest) after() throws — process inline.
    await work
  }

  return new NextResponse('OK', { status: 200 })
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature) return false
  const expected = Buffer.from(
    'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
  )
  let sig: Buffer
  try {
    sig = Buffer.from(signature)
  } catch {
    return false
  }
  // timingSafeEqual requires equal-length buffers; length mismatch is not a secret.
  if (expected.length !== sig.length) return false
  return timingSafeEqual(expected, sig)
}

/**
 * Fire-and-forget superadmin alert for an unroutable phone_number_id.
 * Throttled: at most one unread notification per phone_number_id per 24h —
 * a disconnected org can emit hundreds of messages a day.
 */
async function notifyUnroutablePhoneNumber(phoneNumberId: string): Promise<void> {
  try {
    const alreadyNotified = await hasRecentUnreadSuperadminNotification(
      'webhook_unroutable',
      phoneNumberId,
      24
    )
    if (alreadyNotified) return

    // Platform-level notification with no org behind it, and a webhook has no
    // request locale, so it uses the platform default.
    const tn = await getT('notifications', 'he')

    await notifySuperadmins(
      'webhook_unroutable',
      tn('webhookUnroutableTitle'),
      tn('webhookUnroutableBody', { phoneNumberId }),
      '/admin/orgs'
    )
  } catch (err) {
    console.error('[whatsapp/webhook] Failed to notify superadmins about unroutable phone_number_id', {
      phoneNumberId,
      err,
    })
  }
}

/**
 * Records a template approval transition Meta pushed for one of our WABAs.
 *
 * Routed by `whatsapp_waba_id`, not `whatsapp_phone_number_id`: a template
 * status change names the business account, not a phone line. An unknown WABA
 * is logged and dropped rather than escalated — unlike an unroutable inbound
 * message, nobody is waiting on a reply.
 */
async function recordTemplateStatusUpdate(update: TemplateStatusUpdate): Promise<void> {
  const db = createServiceRoleClient()

  const { data: org, error } = await db
    .from('organizations')
    .select('id')
    .eq('whatsapp_waba_id', update.wabaId)
    .maybeSingle()

  if (error || !org) {
    console.warn('[whatsapp/webhook] Template status update for unknown WABA — ignoring', {
      wabaId: update.wabaId,
      templateName: update.templateName,
    })
    return
  }

  await upsertTemplateStatus(org.id, {
    templateName: update.templateName,
    language: update.language,
    status: update.status,
    reason: update.reason,
  })

  console.info('[whatsapp/webhook] Template status recorded', {
    orgId: org.id,
    templateName: update.templateName,
    language: update.language,
    status: update.status,
  })
}

async function processMessage(
  msg: {
    from: string
    messageId: string
    text: string
    replyId?: string
    businessPhoneNumber: string
    phoneNumberId: string
  },
  origin: string
): Promise<void> {
  const db = createServiceRoleClient()

  // 4. Normalize sender phone
  let senderPhone: string
  try {
    senderPhone = normalizePhone(msg.from)
  } catch (err) {
    if (err instanceof PhoneNormalizationError) {
      console.warn('[whatsapp/webhook] Could not normalize sender phone — ignoring', { from: msg.from })
      return
    }
    throw err
  }

  // 5. Resolve org by phone_number_id (Meta internal ID).
  // Per /docs/sprint-7-scope.md § Story 4 — routing cutover.
  // phone_number_id is the stable, unique identifier Meta sends on every message.
  if (!msg.phoneNumberId) {
    console.warn('[whatsapp/webhook] No phoneNumberId in message — ignoring')
    return
  }

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select(`
      id,
      whatsapp_access_token,
      timezone,
      ai_assistant_enabled,
      automation_lesson_reminder_enabled,
      automation_cancellation_enabled,
      automation_payment_request_enabled,
      automation_dunning_enabled,
      automation_new_leads_enabled,
      default_locale
    `)
    .eq('whatsapp_phone_number_id', msg.phoneNumberId)
    .maybeSingle()

  if (orgError || !org) {
    // An unroutable phone_number_id usually means a disconnected/misconfigured
    // org silently losing messages — escalate instead of just warning.
    console.error('[whatsapp/webhook] No org found for phone_number_id', {
      phoneNumberId: msg.phoneNumberId,
      messageId: msg.messageId,
    })
    Sentry.captureException(new Error('WhatsApp webhook: unknown phone_number_id'), {
      extra: { phoneNumberId: msg.phoneNumberId, messageId: msg.messageId },
    })
    void notifyUnroutablePhoneNumber(msg.phoneNumberId)
    return
  }

  // Decrypt per-org access token (required in production; no env var fallback)
  let accessToken: string
  if (org.whatsapp_access_token) {
    try {
      accessToken = decryptToken(org.whatsapp_access_token as string)
    } catch (err) {
      console.error('[whatsapp/webhook] Failed to decrypt org access token', { orgId: org.id, err })
      return
    }
  } else {
    console.warn('[whatsapp/webhook] Org has no whatsapp_access_token — ignoring', { orgId: org.id })
    return
  }

  const phoneNumberId = msg.phoneNumberId

  // Rate limit: 30 messages per phone per 5 minutes, checked BEFORE the claim
  // so dropped messages insert no row and the window slides. The 200 was
  // already returned before this work runs, so Meta never sees a 429.
  if (await isRateLimited(org.id, senderPhone)) {
    console.warn('[whatsapp/webhook] Rate limit exceeded — dropping message', {
      orgId: org.id,
      senderPhone,
      messageId: msg.messageId,
    })
    return
  }

  const claimed = await claimIncomingMessage(org.id, msg.messageId, senderPhone)
  if (!claimed) {
    console.info('[whatsapp/webhook] Duplicate inbound message ignored', {
      orgId: org.id,
      messageId: msg.messageId,
      senderPhone,
    })
    return
  }

  try {

  // 6. Resolve WHO this is — parent, student, teacher or staff (before the
  //    intent check: only a genuine stranger may become a lead, regardless of
  //    what they wrote). Per /docs/decisions.md #26.
  const sender = await resolveSender(org.id, senderPhone)

  // Language of every reply below. A stored preference wins; otherwise the
  // script of this message decides, falling back to the org default.
  const detected = detectLocaleFromText(msg.text)
  const locale = resolveRecipientLocale({
    stored: sender.role === 'unknown' ? null : sender.preferredLocale,
    detected,
    orgDefault: org.default_locale as string | null,
  })

  if (sender.role === 'unknown') {
    if (org.automation_new_leads_enabled !== false) {
      await handleUnknownSender(org.id, senderPhone, msg.text, accessToken, phoneNumberId, locale)
    }
    return
  }

  // Remember the language for proactive sends (reminders) that have no inbound
  // text to infer from. Only on a real signal — a bare "2" must not flip it.
  // Fire-and-forget: never block a reply on this.
  persistSenderLocale(db, org.id, sender, detected)

  const timezone = (org.timezone as string | null) ?? 'Asia/Jerusalem'

  // 6a₀. Stop / resume business-initiated messages.
  //
  //  Runs before menu payloads and the cancellation session, because a stop word
  //  is most often reached for in the middle of something — an opt-out that only
  //  works from a clean slate is not an opt-out.
  //
  //  Parents only: they are the only capacity that receives proactive messages.
  //  Typed text only (`!msg.replyId`), so a tapped row whose title happens to
  //  read "Start" cannot unsubscribe anyone.
  //
  //  The confirmation goes out via sendTextMessage rather than sendSmartMessage
  //  precisely so it is not swallowed by the flag we just set — and the parent
  //  just messaged us, so the 24h window is open by construction.
  if (sender.role === 'parent' && !msg.replyId) {
    if (hasOptOutIntent(msg.text)) {
      const alreadyOptedOut = await isOptedOut(org.id, senderPhone)
      if (!alreadyOptedOut) await setParentOptOut(org.id, senderPhone, true)
      await deleteCancellationSession(org.id, senderPhone).catch((err) => {
        console.warn('[whatsapp/webhook] Could not clear session on opt-out', { orgId: org.id, err })
      })
      await sendTextMessage(
        senderPhone,
        botString(alreadyOptedOut ? 'opt_out_already' : 'opt_out_confirmed', locale),
        accessToken,
        phoneNumberId
      )
      return
    }

    if (hasResumeIntent(msg.text)) {
      const wasOptedOut = await isOptedOut(org.id, senderPhone)
      if (wasOptedOut) await setParentOptOut(org.id, senderPhone, false)
      await sendTextMessage(
        senderPhone,
        botString(wasOptedOut ? 'opt_in_confirmed' : 'opt_in_already', locale),
        accessToken,
        phoneNumberId
      )
      return
    }
  }

  const menuChoiceRaw = decodeMenuPayload(msg.replyId)

  // 6a. Tapped a capacity in the role picker. Recorded, then straight to that
  //     capacity's menu — nothing else in this message can be for the old role.
  const rolePick = decodeRolePayload(msg.replyId)
  if (rolePick) {
    await handleRoleSwitch({
      orgId: org.id,
      senderPhone,
      sender,
      pick: rolePick,
      accessToken,
      phoneNumberId,
      locale,
    })
    return
  }

  // 6a'. Asked to switch capacity.
  if (menuChoiceRaw?.action === 'switch_role') {
    if (sender.alsoKnownAs.length === 0) {
      // Stale payload from a phone that has since lost its other identity.
      await sendMenuWithFallback({
        orgId: org.id,
        senderPhone,
        accessToken,
        phoneNumberId,
        locale,
        fullName: sender.fullName,
        role: sender.role,
      })
      return
    }
    await sendRolePicker({
      phone: senderPhone,
      accessToken,
      phoneNumberId,
      locale,
      roles: [sender.role, ...sender.alsoKnownAs],
    })
    return
  }

  // 6a''. Non-parent capacities have their own, much narrower flows.
  if (sender.role !== 'parent') {
    const ctx: HandlerContext = {
      db,
      org,
      sender,
      senderPhone,
      accessToken,
      phoneNumberId,
      locale,
      timezone,
      origin,
      msg,
    }

    const handled =
      sender.role === 'student'
        ? await handleStudentMessage(ctx, menuChoiceRaw?.action ?? null)
        : sender.role === 'teacher'
          ? await handleTeacherMessage(ctx, menuChoiceRaw?.action ?? null)
          : await handleStaffMessage(ctx, menuChoiceRaw?.action ?? null)

    if (handled) return

    // Nothing matched. These capacities do not get the AI assistant — its
    // system prompt is built from parent context — so the menu IS the answer.
    await sendMenuWithFallback({
      orgId: org.id,
      senderPhone,
      accessToken,
      phoneNumberId,
      locale,
      fullName: sender.fullName,
      role: sender.role,
      canSwitchRole: sender.alsoKnownAs.length > 0,
    })
    return
  }

  // ── Parent path (unchanged behaviour) ──────────────────────────────────────
  const parent = { id: sender.parentId, full_name: sender.fullName }

  // 6b. Tapped a menu row or button. An explicit choice outranks a cancellation
  //     session still open from an earlier exchange, so this runs first — the
  //     alternative is reading "book a lesson" as a lesson number.
  //     A payload naming an action outside the parent menu is dropped rather
  //     than run: reply ids come from the client.
  const menuChoice =
    menuChoiceRaw && isActionAllowedForRole(menuChoiceRaw.action, 'parent') ? menuChoiceRaw : null
  let forcedStudentId: string | null = null

  if (menuChoiceRaw && !menuChoice) {
    console.warn('[whatsapp/webhook] Dropped menu action not available to a parent', {
      orgId: org.id,
      action: menuChoiceRaw.action,
    })
  }

  if (menuChoice) {
    await deleteCancellationSession(org.id, senderPhone).catch((err) => {
      console.warn('[whatsapp/webhook] Could not clear session on menu tap', { orgId: org.id, err })
    })

    if (needsStudent(menuChoice.action)) {
      const resolved = await resolveStudentForAction({
        db,
        orgId: org.id,
        parentId: parent.id,
        senderPhone,
        action: menuChoice.action,
        studentId: menuChoice.studentId,
        accessToken,
        phoneNumberId,
        locale,
      })
      // null means a picker or an explanatory reply already went out.
      if (!resolved) return
      forcedStudentId = resolved
    } else {
      await runMenuAction({
        action: menuChoice.action,
        parentId: parent.id,
        org,
        senderPhone,
        accessToken,
        phoneNumberId,
        locale,
        origin,
      })
      return
    }
  }

  // 6c. Bare greeting → greet by name and show the menu.
  if (!menuChoice && isGreeting(msg.text)) {
    await sendMenuWithFallback({
      orgId: org.id,
      senderPhone,
      accessToken,
      phoneNumberId,
      locale,
      fullName: parent.full_name as string | null,
      canSwitchRole: sender.alsoKnownAs.length > 0,
    })
    return
  }

  // 7. Known parent — check for active cancellation session first
  const session = forcedStudentId ? null : await getActiveCancellationSession(org.id, senderPhone)

  if (session) {
    await applyCancellationSelection({
      actor: { parentId: parent.id, cancelledBy: 'parent' },
      orgId: org.id,
      senderPhone,
      text: msg.text,
      session,
      timezone,
      accessToken,
      phoneNumberId,
      locale,
    })
    return
  }

  // 8. Check cancellation intent
  if (hasCancellationIntent(msg.text) && org.automation_cancellation_enabled !== false) {
    await startCancellationFlow({
      actor: { parentId: parent.id, cancelledBy: 'parent' },
      orgId: org.id,
      senderPhone,
      timezone,
      accessToken,
      phoneNumberId,
      locale,
    })
    return
  }

  // 8b. Demo reschedule intent (DEMO_RESCHEDULE_ENABLED only — Meta App Review demo)
  if (isDemoRescheduleEnabled() && hasRescheduleIntent(msg.text)) {
    await handleRescheduleIntent({
      parentId: parent.id,
      orgId: org.id,
      senderPhone,
      text: msg.text,
      timezone: (org.timezone as string | null) ?? 'Asia/Jerusalem',
      accessToken,
      phoneNumberId,
      locale,
    })
    return
  }

  // 9a. Homework done intent
  if (hasHomeworkDoneIntent(msg.text)) {
    await handleHomeworkDone(parent.id, org.id, senderPhone, accessToken, phoneNumberId, locale)
    return
  }

  // 9b. Balance query
  if (hasBalanceIntent(msg.text)) {
    await handleBalanceQuery(parent.id, org.id, senderPhone, accessToken, phoneNumberId, locale, origin)
    return
  }

  // 9c. Schedule query
  if (hasScheduleIntent(msg.text)) {
    await handleScheduleQuery(
      parent.id,
      org.id,
      senderPhone,
      (org.timezone as string | null) ?? 'Asia/Jerusalem',
      accessToken,
      phoneNumberId,
      locale
    )
    return
  }

  // 9d. Receipt query
  if (hasReceiptIntent(msg.text)) {
    await handleReceiptQuery(
      parent.id,
      org.id,
      senderPhone,
      (org.timezone as string | null) ?? 'Asia/Jerusalem',
      accessToken,
      phoneNumberId,
      locale
    )
    return
  }

  // 9e. Portal link
  if (hasPortalIntent(msg.text)) {
    await handlePortalQuery(org.id, senderPhone, accessToken, phoneNumberId, locale, origin)
    return
  }

  // 9f. AI satisfaction response (Sprint 25 — 👍/👎 after AI reply)
  if (hasAiSatisfactionIntent(msg.text)) {
    const recentLog = await findRecentUsageLog(org.id, senderPhone)
    if (recentLog) {
      const satisfaction = msg.text.includes('👍') ? 'positive' as const : 'negative' as const
      await updateSatisfaction(recentLog.id, satisfaction)
      console.info('[whatsapp/webhook] AI satisfaction recorded', { orgId: org.id, satisfaction })
      return
    }
    // No recent AI log — fall through to normal intent handling
  }

  // 10. Check booking intent (already decided if this came from a menu tap)
  if (!forcedStudentId && !hasBookingIntent(msg.text)) {
    // No recognized intent — try AI assistant if enabled, else polite fallback
    const aiConfigured = isAiAssistantConfigured() || await isAiConfiguredForOrg(org.id)
    if (org.ai_assistant_enabled && aiConfigured) {
      let reply: string
      let shouldLogExchange = false

      try {
        const aiResult = await aiAssistant(org.id, senderPhone, parent.id, msg.text, locale)
        reply = aiResult.reply
        shouldLogExchange = true
      } catch (err) {
        console.error('[whatsapp/webhook] aiAssistant failed — falling back to template', {
          orgId: org.id,
          err,
        })
        reply = await resolveTemplate(org.id, 'unknown_intent_fallback', {}, locale)
      }

      await sendTextMessage(senderPhone, reply, accessToken, phoneNumberId)

      // Send satisfaction follow-up (Sprint 25)
      if (shouldLogExchange) {
        const satisfactionBody = await resolveTemplate(org.id, 'ai_satisfaction_prompt', {}, locale)
        await sendTextMessage(senderPhone, satisfactionBody, accessToken, phoneNumberId).catch((err) => {
          console.error('[whatsapp/webhook] Failed to send satisfaction prompt', { orgId: org.id, err })
        })
      }

      if (shouldLogExchange) {
        await logExchange(org.id, senderPhone, parent.id, msg.text, reply).catch((err) => {
          console.error('[whatsapp/webhook] Failed to persist AI exchange after send', {
            orgId: org.id,
            senderPhone,
            err,
          })
        })
      }
    } else {
      if (org.ai_assistant_enabled && !aiConfigured) {
        console.warn('[whatsapp/webhook] AI assistant enabled but no API key configured — using fallback reply', {
          orgId: org.id,
        })
      }
      // The menu IS the "I did not understand" reply — it names the same options
      // the text template lists, but tappable. Sending both put two messages in
      // front of the parent for one inbound message.
      await sendMenuWithFallback({
        orgId: org.id,
        senderPhone,
        accessToken,
        phoneNumberId,
        locale,
        fullName: parent.full_name as string | null,
        canSwitchRole: sender.alsoKnownAs.length > 0,
      })
    }
    return
  }

  // 10. Resolve the student to book for. A multi-student parent now gets a
  //     picker instead of being turned away.
  const studentId =
    forcedStudentId ??
    (await resolveStudentForAction({
      db,
      orgId: org.id,
      parentId: parent.id,
      senderPhone,
      action: 'book',
      accessToken,
      phoneNumberId,
      locale,
    }))

  if (!studentId) return

  // 9. Generate signed booking JWT (15-min expiry)
  const token = await signBookingToken({
    organizationId: org.id,
    parentId: parent.id,
    studentId,
  })

  // 10. Build booking URL from request origin
  const bookingUrl = `${origin}/book/${token}`

  // 11. Send booking link via WhatsApp, as a CTA button — the signed token makes
  //     the raw URL unreadably long in a plain-text body.
  await sendLinkReply({
    orgId: org.id,
    to: senderPhone,
    templateType: 'booking_link',
    urlVar: 'booking_url',
    url: bookingUrl,
    buttonKey: 'cta_book_lesson',
    locale,
    accessToken,
    phoneNumberId,
  })
  console.info('[whatsapp/webhook] Booking link sent', { messageId: msg.messageId })
  } catch (error) {
    await releaseIncomingMessageClaim(org.id, msg.messageId)
    throw error
  }
}

async function handleUnknownSender(
  organizationId: string,
  phone: string,
  rawMessage: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale
): Promise<void> {
  // Upsert lead — creates on first contact, updates updated_at only on repeat
  await upsertLead(organizationId, phone, rawMessage).catch(err => {
    console.error('[whatsapp/webhook] Failed to upsert lead', { phone, err })
  })

  // Fire-and-forget: in-app notification for new lead (Sprint 25 Story 4)
  void (async () => {
    try {
      const recipients = await getOwnerAndAdminProfileIds(organizationId)
      const tn = await getT('notifications', locale)
      await notifyMultiple(
        organizationId,
        recipients,
        'new_lead',
        tn('newLead', { phone }),
        rawMessage?.slice(0, 100) || undefined,
        '/leads'
      )
    } catch (err) {
      console.error('[whatsapp/webhook] lead notification failed', { organizationId, phone, err })
    }
  })()

  // Send fixed reply to unknown sender (Decision #4)
  await sendUnknownParentReply(phone, accessToken, phoneNumberId, locale)
}

/**
 * Sends the interactive menu, falling back to the plain-text template list when
 * the interactive send is rejected (outside the 24h window, or a client that
 * cannot render lists). `skipTextFallback` is for callers that already sent the
 * text version and only want the buttons on top.
 */
async function sendMenuWithFallback(params: {
  orgId: string
  senderPhone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
  fullName: string | null
  role?: KnownSenderRole
  canSwitchRole?: boolean
  skipTextFallback?: boolean
}): Promise<void> {
  const { orgId, senderPhone, accessToken, phoneNumberId, locale, fullName } = params

  await sendMainMenu({
    phone: senderPhone,
    accessToken,
    phoneNumberId,
    locale,
    fullName,
    role: params.role ?? 'parent',
    canSwitchRole: params.canSwitchRole,
    onFallback: async () => {
      if (params.skipTextFallback) return
      const body = await resolveTemplate(orgId, 'unknown_intent_fallback', {}, locale)
      await sendTextMessage(senderPhone, body, accessToken, phoneNumberId)
    },
  })
  // Deliberately not swallowed: if the menu AND its text fallback both fail, the
  // parent got no answer at all, and the caller's catch releases the inbound
  // claim so Meta's retry can deliver one.
}

/**
 * Persists the language detected from this message on the sender's own row.
 * Fire-and-forget. Students have no locale column — their language is inferred
 * from each message instead.
 */
function persistSenderLocale(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  sender: ResolvedSender,
  detected: AppLocale | null
): void {
  if (!detected || sender.role === 'unknown' || sender.role === 'student') return
  if (sender.preferredLocale === detected) return

  const table = sender.role === 'parent' ? 'parents' : 'profiles'
  const id = sender.role === 'parent' ? sender.parentId : sender.profileId

  void db
    .from(table)
    .update({ preferred_locale: detected })
    .eq('id', id)
    .eq('organization_id', orgId)
    .then(({ error }) => {
      if (error) {
        console.warn('[whatsapp/webhook] Failed to persist sender locale', {
          orgId,
          role: sender.role,
          error: error.message,
        })
      }
    })
}

/**
 * Records an explicit capacity choice and shows that capacity's menu.
 * A pick the phone no longer holds is ignored rather than stored.
 */
async function handleRoleSwitch(params: {
  orgId: string
  senderPhone: string
  sender: ResolvedSender
  pick: KnownSenderRole
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
}): Promise<void> {
  const { orgId, senderPhone, sender, pick, accessToken, phoneNumberId, locale } = params
  if (sender.role === 'unknown') return

  const held: KnownSenderRole[] = [sender.role, ...sender.alsoKnownAs]
  if (!held.includes(pick)) {
    console.warn('[whatsapp/webhook] Role pick not held by this phone — ignoring', {
      orgId,
      pick,
      held,
    })
    await sendMenuWithFallback({
      orgId,
      senderPhone,
      accessToken,
      phoneNumberId,
      locale,
      fullName: sender.fullName,
      role: sender.role,
      canSwitchRole: sender.alsoKnownAs.length > 0,
    })
    return
  }

  await setSenderPreference(orgId, senderPhone, pick).catch((err) => {
    // A failed write costs them the preference, not the reply.
    console.error('[whatsapp/webhook] Could not store role preference', { orgId, pick, err })
  })

  await sendTextMessage(
    senderPhone,
    botString('role_switched', locale, { role_label: botString(`role_label_${pick}`, locale) }),
    accessToken,
    phoneNumberId
  )

  await sendMenuWithFallback({
    orgId,
    senderPhone,
    accessToken,
    phoneNumberId,
    locale,
    fullName: sender.fullName,
    role: pick,
    canSwitchRole: true,
    skipTextFallback: true,
  })
}

/**
 * Resolves which student a per-student action applies to.
 *
 * Returns the student id when it is unambiguous; returns null after sending a
 * picker (several students) or an explanatory reply (none / unknown id), in
 * which case the caller must stop.
 */
async function resolveStudentForAction(params: {
  db: ReturnType<typeof createServiceRoleClient>
  orgId: string
  parentId: string
  senderPhone: string
  action: MenuAction
  studentId?: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
}): Promise<string | null> {
  const { db, orgId, parentId, senderPhone, action, accessToken, phoneNumberId, locale } = params

  const { data: rels, error } = await db
    .from('relationships')
    .select('student_id, students ( id, full_name )')
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)

  if (error) {
    console.error('[whatsapp/webhook] DB error looking up students', { orgId, parentId, error })
    throw new Error('Failed to look up parent students')
  }

  type RelRow = { student_id: string; students: { id: string; full_name: string | null } | null }
  const students = ((rels ?? []) as unknown as RelRow[])
    .map((r) => r.students)
    .filter((s): s is { id: string; full_name: string | null } => Boolean(s))

  // A tapped payload names the student directly — but verify it still belongs
  // to this parent rather than trusting an id echoed back from the client.
  if (params.studentId) {
    const match = students.find((s) => s.id === params.studentId)
    if (match) return match.id
    console.warn('[whatsapp/webhook] Tapped student is not linked to this parent', {
      orgId,
      parentId,
      studentId: params.studentId,
    })
    await sendTextMessage(senderPhone, botString('child_not_found', locale), accessToken, phoneNumberId)
    return null
  }

  if (students.length === 0) {
    await sendTextMessage(senderPhone, botString('booking_no_student', locale), accessToken, phoneNumberId)
    return null
  }

  if (students.length === 1) return students[0].id

  await sendStudentPicker({
    phone: senderPhone,
    accessToken,
    phoneNumberId,
    locale,
    action,
    students,
  })
  return null
}

/** Routes a tapped menu action that does not depend on a specific student. */
async function runMenuAction(params: {
  action: MenuAction
  parentId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  org: any
  senderPhone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
  origin: string
}): Promise<void> {
  const { action, parentId, org, senderPhone, accessToken, phoneNumberId, locale, origin } = params
  const timezone = (org.timezone as string | null) ?? 'Asia/Jerusalem'

  switch (action) {
    case 'cancel':
      if (org.automation_cancellation_enabled === false) {
        await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId, locale)
        return
      }
      await startCancellationFlow({
        actor: { parentId, cancelledBy: 'parent' },
        orgId: org.id,
        senderPhone,
        timezone,
        accessToken,
        phoneNumberId,
        locale,
      })
      return
    case 'balance':
      await handleBalanceQuery(parentId, org.id, senderPhone, accessToken, phoneNumberId, locale, origin)
      return
    case 'schedule':
      await handleScheduleQuery(
        parentId, org.id, senderPhone, timezone, accessToken, phoneNumberId, locale
      )
      return
    case 'portal':
      await handlePortalQuery(org.id, senderPhone, accessToken, phoneNumberId, locale, origin)
      return
    default:
      console.warn('[whatsapp/webhook] Unhandled menu action', { action })
  }
}

async function sendBookingUnavailableReply(
  phone: string,
  body: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  await sendTextMessage(phone, body, accessToken, phoneNumberId)
}

// ── Sprint 14: helper ─────────────────────────────────────────────────────────

/**
 * Returns student IDs for a parent within an org.
 */
async function getParentStudentIds(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  parentId: string
): Promise<string[]> {
  const { data, error } = await db
    .from('relationships')
    .select('student_id')
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)

  if (error) {
    console.error('[whatsapp/webhook] getParentStudentIds DB error', { orgId, parentId, error })
    throw new Error('Failed to load student relationships for parent')
  }
  return (data ?? []).map((r: { student_id: string }) => r.student_id)
}

// ── Sprint 14: new intent handlers ────────────────────────────────────────────

async function handleHomeworkDone(
  parentId: string,
  orgId: string,
  senderPhone: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale
): Promise<void> {
  const db = createServiceRoleClient()

  const studentIds = await getParentStudentIds(db, orgId, parentId)

  // Most recently created pending assignment across this parent's students.
  const assignments = await findOpenAssignments({ db, orgId, studentIds, limit: 1 })

  if (assignments.length === 0) {
    await sendTextMessage(
      senderPhone,
      botString('no_open_homework', locale),
      accessToken,
      phoneNumberId
    )
    return
  }

  const assignment = assignments[0]
  const studentName = await studentDisplayName(db, orgId, assignment.studentId, locale)

  await markAssignmentDoneAndAlert({
    db,
    orgId,
    assignment,
    studentName,
    markedBy: 'parent',
    accessToken,
    phoneNumberId,
  })

  // Reply to parent
  await sendTextMessage(
    senderPhone,
    botString('homework_marked_done', locale, { student_name: studentName }),
    accessToken,
    phoneNumberId
  ).catch((err) => {
    console.error('[whatsapp/webhook] handleHomeworkDone: failed to send parent reply', { orgId, senderPhone, err })
  })

  console.info('[whatsapp/webhook] Homework marked done', { orgId, assignmentId: assignment.id, senderPhone })
}

async function handleBalanceQuery(
  parentId: string,
  orgId: string,
  senderPhone: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale,
  origin: string
): Promise<void> {
  const db = createServiceRoleClient()

  // Query pending/invoiced charges (charges link to parent_id)
  const { data: charges, error } = await db
    .from('charges')
    .select('amount, payment_link')
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)
    .in('status', ['pending', 'invoiced'])
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[whatsapp/webhook] handleBalanceQuery: DB error', { orgId, parentId, error })
    throw new Error('Failed to load balance data for parent')
  }

  const chargeRows = (charges ?? []).map((c) => ({
    amount: Number((c as { amount: number }).amount),
    payment_link: (c as { payment_link: string | null }).payment_link,
  }))
  const total = sumOpenCharges(chargeRows)

  // Nothing open — the template body ("here is what you owe, here is how to pay")
  // would be nonsense against a zero total.
  if (total <= 0) {
    await sendTextMessage(senderPhone, botString('balance_none', locale), accessToken, phoneNumberId)
    console.info('[whatsapp/webhook] Balance query replied — nothing open', { orgId, senderPhone })
    return
  }

  // The breakdown lives in the portal; the reply carries the total, a way in,
  // and a way to pay. charge_lines is still supplied for orgs whose custom
  // template predates this copy — otherwise their body leaks the raw placeholder.
  const chargeLines = chargeRows.slice(0, 3).map(c => {
    let line = `\n₪${c.amount.toFixed(2)}`
    if (c.payment_link) line += `, ${botString('pay_here', locale)}: ${c.payment_link}`
    return line
  }).join('')

  await sendLinkReply({
    orgId,
    to: senderPhone,
    templateType: 'balance_reply',
    urlVar: 'portal_url',
    url: `${origin}/portal/${orgId}/payments`,
    buttonKey: 'cta_open_portal',
    locale,
    accessToken,
    phoneNumberId,
    vars: {
      total: total.toFixed(2),
      payment_line: resolvePaymentLine(chargeRows, locale),
      charge_lines: chargeLines,
    },
  })

  console.info('[whatsapp/webhook] Balance query replied', { orgId, senderPhone, total })
}

async function handleScheduleQuery(
  parentId: string,
  orgId: string,
  senderPhone: string,
  timezone: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale
): Promise<void> {
  const db = createServiceRoleClient()

  const studentIds = await getParentStudentIds(db, orgId, parentId)
  const lessonLines = await buildUpcomingLessonLines({
    db,
    orgId,
    studentIds,
    timezone,
    locale,
  })

  const scheduleBody = await resolveTemplate(orgId, 'schedule_reply', { lesson_lines: lessonLines }, locale)
  await sendTextMessage(senderPhone, scheduleBody, accessToken, phoneNumberId)

  console.info('[whatsapp/webhook] Schedule query replied', { orgId, senderPhone })
}

async function handleReceiptQuery(
  parentId: string,
  orgId: string,
  senderPhone: string,
  timezone: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale
): Promise<void> {
  const db = createServiceRoleClient()

  const { data: charges, error } = await db
    .from('charges')
    .select('amount, updated_at')
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)
    .eq('status', 'paid')
    .order('updated_at', { ascending: false })
    .limit(3)

  if (error) {
    console.error('[whatsapp/webhook] handleReceiptQuery: DB error', { orgId, parentId, error })
    throw new Error('Failed to load receipt history for parent')
  }

  type ChargeRow = { amount: number; updated_at: string }
  const formatted = (charges ?? []).map((c) => {
    const row = c as ChargeRow
    const dt = DateTime.fromISO(row.updated_at, { zone: 'utc' }).setZone(timezone)
    return {
      date: dt.toFormat('dd/MM/yyyy'),
      amount: row.amount,
    }
  })

  const receiptLines = formatted.length === 0
    ? '\n' + botString('no_previous_payments', locale)
    : '\n' + formatted.map(c => `${c.date}: ₪${c.amount.toFixed(2)} ${botString('paid_marker', locale)}`).join('\n')
  const receiptTotal = formatted.reduce((sum, c) => sum + c.amount, 0)
  const receiptBody = await resolveTemplate(orgId, 'payment_history_reply', {
    total: receiptTotal.toFixed(2),
    charge_lines: receiptLines,
  }, locale)
  await sendTextMessage(senderPhone, receiptBody, accessToken, phoneNumberId)

  console.info('[whatsapp/webhook] Receipt query replied', { orgId, senderPhone })
}

/**
 * Detects thumbs-up or thumbs-down emoji — used for AI satisfaction tracking.
 */
function hasAiSatisfactionIntent(text: string): boolean {
  const trimmed = text.trim()
  return trimmed === '👍' || trimmed === '👎' ||
    trimmed === '👍🏻' || trimmed === '👍🏼' || trimmed === '👍🏽' || trimmed === '👍🏾' || trimmed === '👍🏿' ||
    trimmed === '👎🏻' || trimmed === '👎🏼' || trimmed === '👎🏽' || trimmed === '👎🏾' || trimmed === '👎🏿'
}

async function handlePortalQuery(
  orgId: string,
  senderPhone: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale,
  origin: string
): Promise<void> {
  // Built from the request origin, not NEXT_PUBLIC_APP_URL: that var is inlined
  // at build time, so a stale/localhost value in the deploy environment shipped
  // parents an unreachable link. The origin is whatever host Meta just called.
  const portalUrl = `${origin}/portal/${orgId}`

  await sendLinkReply({
    orgId,
    to: senderPhone,
    templateType: 'portal_link_reply',
    urlVar: 'portal_url',
    url: portalUrl,
    buttonKey: 'cta_open_portal',
    locale,
    accessToken,
    phoneNumberId,
  })

  console.info('[whatsapp/webhook] Portal query replied', { orgId, senderPhone })
}
