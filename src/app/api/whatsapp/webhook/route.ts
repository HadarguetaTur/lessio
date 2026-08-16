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
  sendCancellationLessonList,
  sendNoEligibleLessonsReply,
  sendInvalidSelectionReply,
  sendHomeworkAlert,
  sendTextMessage,
  parseWebhookPayload,
  hasBookingIntent,
  hasCancellationIntent,
  hasHomeworkDoneIntent,
  hasBalanceIntent,
  hasScheduleIntent,
  hasReceiptIntent,
  hasPortalIntent,
} from '@/lib/whatsapp'
import { resolveTemplate } from '@/lib/whatsapp/templates'
import { botString } from '@/lib/whatsapp/strings'
import {
  detectLocaleFromText,
  parseAppLocale,
  resolveRecipientLocale,
  toIntlLocale,
  toLuxonLocale,
  type AppLocale,
} from '@/lib/i18n/locale'
import {
  isDemoRescheduleEnabled,
  hasRescheduleIntent,
  handleRescheduleIntent,
} from '@/lib/whatsapp/demoReschedule'
import { upsertLead } from '@/lib/leads'
import {
  getEligibleLessons,
  formatLessonListMessage,
  upsertCancellationSession,
  getActiveCancellationSession,
  deleteCancellationSession,
  executeCancellation,
} from '@/lib/cancellation-flow'
import { markAssignmentDone } from '@/lib/homework'
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

    await notifySuperadmins(
      'webhook_unroutable',
      'הודעת WhatsApp התקבלה למספר לא מזוהה',
      `phone_number_id: ${phoneNumberId} — ייתכן שארגון נותק או שהחיבור שלו פגום.`,
      '/admin/orgs'
    )
  } catch (err) {
    console.error('[whatsapp/webhook] Failed to notify superadmins about unroutable phone_number_id', {
      phoneNumberId,
      err,
    })
  }
}

async function processMessage(
  msg: {
    from: string
    messageId: string
    text: string
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

  // 6. Look up parent by phone in this org (before intent check — any message from
  //    an unrecognized sender must create a lead, regardless of intent)
  const { data: parent, error: parentError } = await db
    .from('parents')
    .select('id, preferred_locale')
    .eq('organization_id', org.id)
    .eq('phone', senderPhone)
    .eq('is_active', true)
    .maybeSingle()

    if (parentError) {
      console.error('[whatsapp/webhook] DB error looking up parent', { error: parentError })
      throw new Error('Failed to look up parent for inbound WhatsApp message')
    }

  // Language of every reply below. A stored preference wins; otherwise the
  // script of this message decides, falling back to the org default.
  const detected = detectLocaleFromText(msg.text)
  const locale = resolveRecipientLocale({
    stored: parent?.preferred_locale as string | null | undefined,
    detected,
    orgDefault: org.default_locale as string | null,
  })

  if (!parent) {
    if (org.automation_new_leads_enabled !== false) {
      await handleUnknownSender(org.id, senderPhone, msg.text, accessToken, phoneNumberId, locale)
    }
    return
  }

  // Remember the language for proactive sends (reminders) that have no inbound
  // text to infer from. Only on a real signal — a bare "2" must not flip it.
  // Fire-and-forget: never block a reply on this.
  if (detected && parent.preferred_locale !== detected) {
    void db
      .from('parents')
      .update({ preferred_locale: detected })
      .eq('id', parent.id)
      .eq('organization_id', org.id)
      .then(({ error }) => {
        if (error) {
          console.warn('[whatsapp/webhook] Failed to persist parent locale', {
            orgId: org.id,
            parentId: parent.id,
            error: error.message,
          })
        }
      })
  }

  // 7. Known parent — check for active cancellation session first
  const session = await getActiveCancellationSession(org.id, senderPhone)

  if (session) {
    await handleCancellationSelection(
      parent.id, org.id, senderPhone, msg.text,
      session,
      (org.timezone as string | null) ?? 'Asia/Jerusalem',
      accessToken, phoneNumberId, locale
    )
    return
  }

  // 8. Check cancellation intent
  if (hasCancellationIntent(msg.text) && org.automation_cancellation_enabled !== false) {
    await handleCancellationIntent(
      parent.id, org.id, senderPhone,
      (org.timezone as string | null) ?? 'Asia/Jerusalem',
      accessToken, phoneNumberId, locale
    )
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
    await handleBalanceQuery(parent.id, org.id, senderPhone, accessToken, phoneNumberId, locale)
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
    await handlePortalQuery(org.id, senderPhone, accessToken, phoneNumberId, locale)
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

  // 10. Check booking intent
  if (!hasBookingIntent(msg.text)) {
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
      const unknownBody = await resolveTemplate(org.id, 'unknown_intent_fallback', {}, locale)
      await sendTextMessage(senderPhone, unknownBody, accessToken, phoneNumberId)
    }
    return
  }

  // 10. Resolve student for this parent
  const { data: relationships, error: relError } = await db
    .from('relationships')
    .select('student_id')
    .eq('organization_id', org.id)
    .eq('parent_id', parent.id)

    if (relError || !relationships) {
      console.error('[whatsapp/webhook] DB error looking up students', { error: relError })
      throw new Error('Failed to look up parent students for booking flow')
    }

    if (relationships.length === 0) {
      console.warn('[whatsapp/webhook] Parent has no students — sending explanatory reply', {
        orgId: org.id,
        parentId: parent.id,
      })
      await sendBookingUnavailableReply(
        senderPhone,
        botString('booking_no_student', locale),
        accessToken,
        phoneNumberId
      )
      return
    }

    if (relationships.length > 1) {
      console.warn('[whatsapp/webhook] Parent has multiple students — sending explanatory reply', {
        orgId: org.id,
        parentId: parent.id,
        studentCount: relationships.length,
      })
      await sendBookingUnavailableReply(
        senderPhone,
        botString('booking_multiple_students', locale),
        accessToken,
        phoneNumberId
      )
      return
    }

  const studentId = relationships[0].student_id

  // 9. Generate signed booking JWT (15-min expiry)
  const token = await signBookingToken({
    organizationId: org.id,
    parentId: parent.id,
    studentId,
  })

  // 10. Build booking URL from request origin
  const bookingUrl = `${origin}/book/${token}`

  // 11. Send booking link via WhatsApp
  const bookingLinkBody = await resolveTemplate(org.id, 'booking_link', { booking_url: bookingUrl }, locale)
  await sendTextMessage(senderPhone, bookingLinkBody, accessToken, phoneNumberId)
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
      await notifyMultiple(
        organizationId,
        recipients,
        'new_lead',
        `ליד חדש — ${phone}`,
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

async function sendBookingUnavailableReply(
  phone: string,
  body: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  await sendTextMessage(phone, body, accessToken, phoneNumberId)
}

async function handleCancellationIntent(
  parentId: string,
  orgId: string,
  senderPhone: string,
  timezone: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale
): Promise<void> {
  const lessons = await getEligibleLessons(orgId, parentId)

  if (lessons.length === 0) {
    await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId, locale)
    return
  }

  const message = formatLessonListMessage(lessons, timezone, locale)
  await upsertCancellationSession(orgId, senderPhone, lessons.map(l => l.id))
  await sendCancellationLessonList(senderPhone, message, accessToken, phoneNumberId)
  console.info('[whatsapp/webhook] Cancellation lesson list sent', { orgId, senderPhone })
}

async function handleCancellationSelection(
  parentId: string,
  orgId: string,
  senderPhone: string,
  text: string,
  session: { lesson_ids: string[] },
  timezone: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale
): Promise<void> {
  const num = parseInt(text.trim(), 10)
  const count = session.lesson_ids.length

  if (isNaN(num) || num < 1 || num > count) {
    // Invalid input — keep flow open
    await sendInvalidSelectionReply(senderPhone, accessToken, phoneNumberId, locale)

    // Re-fetch eligible lessons to rebuild the list (lesson may have changed)
    const lessons = await getEligibleLessons(orgId, parentId)
    if (lessons.length === 0) {
      await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId, locale)
      await deleteCancellationSession(orgId, senderPhone)
      return
    }
    const message = formatLessonListMessage(lessons, timezone, locale)
    await upsertCancellationSession(orgId, senderPhone, lessons.map(l => l.id))
    await sendCancellationLessonList(senderPhone, message, accessToken, phoneNumberId)
    return
  }

  // Valid selection — execute cancellation
  const selectedLessonId = session.lesson_ids[num - 1]

  const outcome = await executeCancellation(selectedLessonId, parentId, orgId)

  if (!outcome.success) {
    if (outcome.error === 'already_cancelled') {
      // Idempotency: already processed, close flow silently
      await deleteCancellationSession(orgId, senderPhone)
      return
    }

    // Lesson no longer eligible — error + rebuild list
    const lessons = await getEligibleLessons(orgId, parentId)
    if (lessons.length === 0) {
      await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId, locale)
      await deleteCancellationSession(orgId, senderPhone)
      return
    }
    const errorMsg = botString('lesson_no_longer_cancellable', locale)
    await sendCancellationLessonList(
      senderPhone,
      errorMsg + '\n\n' + formatLessonListMessage(lessons, timezone, locale),
      accessToken,
      phoneNumberId
    )
    await upsertCancellationSession(orgId, senderPhone, lessons.map(l => l.id))
    return
  }

  // Success — delete session
  await deleteCancellationSession(orgId, senderPhone)

  try {
    // Notify parent — WhatsApp failure must not roll back the completed cancellation
    const ccDate = new Date(outcome.lessonStartAt).toLocaleDateString(toIntlLocale(locale), {
      timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long',
    })
    const ccTime = new Date(outcome.lessonStartAt).toLocaleTimeString(toIntlLocale(locale), {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    })
    let ccChargeLine = ''
    if (outcome.chargeResult.chargeType && outcome.chargeResult.amount > 0) {
      const label = botString(
        outcome.chargeResult.chargeType === 'full' ? 'charge_full' : 'charge_partial',
        locale
      )
      ccChargeLine = `\n${label}: ₪${outcome.chargeResult.amount.toFixed(2)}`
    }
    const ccBody = await resolveTemplate(orgId, 'cancellation_confirmation', {
      student_name: outcome.studentName,
      teacher_name: outcome.teacherName,
      date: ccDate,
      time: ccTime,
      charge_line: ccChargeLine,
    }, locale)
    await sendTextMessage(senderPhone, ccBody, accessToken, phoneNumberId).catch(err => {
      console.error('[whatsapp/webhook] Failed to send cancellation confirmation — cancellation committed', { orgId, senderPhone, lessonId: selectedLessonId, err })
    })

    // Notify admin (best-effort — do not throw if admin phone missing)
    const db = createServiceRoleClient()
    const { data: ownerProfile } = await db
      .from('profiles')
      .select('phone, preferred_locale')
      .eq('organization_id', orgId)
      .eq('role', 'owner')
      .eq('is_active', true)
      .maybeSingle()

    if (ownerProfile?.phone) {
      // The admin alert goes to the owner — their own UI language, not the parent's.
      const adminLocale = parseAppLocale(ownerProfile.preferred_locale as string | undefined)
      const adminDate = new Date(outcome.lessonStartAt).toLocaleDateString(toIntlLocale(adminLocale), {
        timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long',
      })
      const adminTime = new Date(outcome.lessonStartAt).toLocaleTimeString(toIntlLocale(adminLocale), {
        timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
      })
      let caChargeLine = ''
      if (outcome.chargeResult.chargeType && outcome.chargeResult.amount > 0) {
        const label = botString(
          outcome.chargeResult.chargeType === 'full' ? 'charge_full' : 'charge_partial',
          adminLocale
        )
        caChargeLine = `\n${botString('charge_line_label', adminLocale)}: ₪${outcome.chargeResult.amount.toFixed(2)} (${label})`
      } else {
        caChargeLine = `\n${botString('charge_none', adminLocale)}`
      }
      const caBody = await resolveTemplate(orgId, 'cancellation_admin_alert', {
        student_name: outcome.studentName,
        teacher_name: outcome.teacherName,
        date: adminDate,
        time: adminTime,
        charge_line: caChargeLine,
        parent_phone: senderPhone,
      }, adminLocale)
      await sendTextMessage(ownerProfile.phone, caBody, accessToken, phoneNumberId).catch(err => {
        console.error('[whatsapp/webhook] Failed to send admin cancellation alert', err)
      })
    }
  } catch (err) {
    console.error('[whatsapp/webhook] Post-cancellation notification flow failed after commit', {
      orgId,
      senderPhone,
      lessonId: selectedLessonId,
      err,
    })
  }

  console.info('[whatsapp/webhook] Cancellation completed', { orgId, selectedLessonId, senderPhone })
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
  if (studentIds.length === 0) {
    await sendTextMessage(
      senderPhone,
      botString('no_open_homework', locale),
      accessToken,
      phoneNumberId
    )
    return
  }

  // Find most recently created pending assignment for this parent's students
  const { data: assignments, error: asgError } = await db
    .from('homework_assignments')
    .select('id, title, student_id, teacher_id')
    .in('student_id', studentIds)
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)

  if (asgError) {
    console.error('[whatsapp/webhook] handleHomeworkDone: DB error', { orgId, parentId, error: asgError })
    throw new Error('Failed to load homework assignments for parent')
  }

  if (!assignments || assignments.length === 0) {
    await sendTextMessage(
      senderPhone,
      botString('no_open_homework', locale),
      accessToken,
      phoneNumberId
    )
    return
  }

  type AssignmentRow = { id: string; title: string; student_id: string; teacher_id: string }
  const assignment = assignments[0] as AssignmentRow

  // Mark as done
  await markAssignmentDone({ assignmentId: assignment.id, organizationId: orgId })

  // Get student name
  const { data: student } = await db
    .from('students')
    .select('full_name')
    .eq('id', assignment.student_id)
    .single()

  const studentName = (student as { full_name: string } | null)?.full_name ?? botString('the_student', locale)

  // Notify teacher — in the teacher's own UI language, not the parent's
  const { data: teacherProfile } = await db
    .from('teachers')
    .select('profiles ( phone, preferred_locale )')
    .eq('id', assignment.teacher_id)
    .single()

  const teacherRow = (
    teacherProfile as { profiles: { phone: string | null; preferred_locale: string | null } | null } | null
  )?.profiles
  const teacherPhone = teacherRow?.phone

  if (teacherPhone) {
    const teacherLocale = parseAppLocale(teacherRow?.preferred_locale ?? undefined)
    await sendHomeworkAlert(
      teacherPhone, studentName, assignment.title, accessToken, phoneNumberId, teacherLocale
    ).catch((err) => {
      console.error('[whatsapp/webhook] handleHomeworkDone: sendHomeworkAlert failed', { orgId, err })
    })
  }

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
  locale: AppLocale
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

  const chargeRows = (charges ?? []) as Array<{ amount: number; payment_link: string | null }>
  const total = chargeRows.reduce((sum, c) => sum + c.amount, 0)
  const chargeLines = chargeRows.slice(0, 3).map(c => {
    let line = `\n₪${c.amount.toFixed(2)}`
    if (c.payment_link) line += `, ${botString('pay_here', locale)}: ${c.payment_link}`
    return line
  }).join('')

  const balanceBody = await resolveTemplate(orgId, 'balance_reply', {
    total: total.toFixed(2),
    charge_lines: chargeLines,
  }, locale)
  await sendTextMessage(senderPhone, balanceBody, accessToken, phoneNumberId)

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
  const noLessons = botString('no_upcoming_lessons', locale)

  const studentIds = await getParentStudentIds(db, orgId, parentId)
  if (studentIds.length === 0) {
    const emptyBody = await resolveTemplate(orgId, 'schedule_reply', { lesson_lines: noLessons }, locale)
    await sendTextMessage(senderPhone, emptyBody, accessToken, phoneNumberId)
    return
  }

  // Get lesson IDs for these students
  const { data: lessonStudents, error: lsError } = await db
    .from('lesson_students')
    .select('lesson_id')
    .in('student_id', studentIds)
    .eq('organization_id', orgId)

  if (lsError) {
    console.error('[whatsapp/webhook] handleScheduleQuery: lesson_students DB error', { orgId, parentId, error: lsError })
    throw new Error('Failed to load lesson relationships for schedule query')
  }

  if (!lessonStudents || lessonStudents.length === 0) {
    const emptyBody = await resolveTemplate(orgId, 'schedule_reply', { lesson_lines: noLessons }, locale)
    await sendTextMessage(senderPhone, emptyBody, accessToken, phoneNumberId)
    return
  }

  const lessonIds = (lessonStudents as Array<{ lesson_id: string }>).map((r) => r.lesson_id)

  const { data: lessons, error: lessonsError } = await db
    .from('lessons')
    .select('start_at, teachers ( profiles ( full_name ) )')
    .in('id', lessonIds)
    .eq('organization_id', orgId)
    .eq('status', 'scheduled')
    .gt('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .limit(3)

  if (lessonsError) {
    console.error('[whatsapp/webhook] handleScheduleQuery: DB error', { orgId, parentId, error: lessonsError })
    throw new Error('Failed to load scheduled lessons for parent')
  }

  type LessonRow = {
    start_at: string
    teachers: { profiles: { full_name: string } | null } | null
  }

  const dateFormat = locale === 'he' ? 'EEEE, d בMMMM' : 'EEEE, MMMM d'
  const formatted = (lessons ?? []).map((l) => {
    const row = l as unknown as LessonRow
    const dt = DateTime.fromISO(row.start_at, { zone: 'utc' }).setZone(timezone)
    return {
      date: dt.toFormat(dateFormat, { locale: toLuxonLocale(locale) }),
      time: dt.toFormat('HH:mm'),
      teacherName: (row.teachers?.profiles as { full_name: string } | null)?.full_name
        ?? botString('the_teacher', locale),
    }
  })

  const lessonLines = formatted.length === 0
    ? noLessons
    : formatted.map((l, i) =>
        locale === 'he'
          ? `${i + 1}. ${l.date} בשעה ${l.time} עם ${l.teacherName}`
          : `${i + 1}. ${l.date} at ${l.time} with ${l.teacherName}`
      ).join('\n')
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
  locale: AppLocale
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const portalUrl = `${appUrl}/portal/${orgId}`

  const portalBody = await resolveTemplate(orgId, 'portal_link_reply', { portal_url: portalUrl }, locale)
  await sendTextMessage(senderPhone, portalBody, accessToken, phoneNumberId)

  console.info('[whatsapp/webhook] Portal query replied', { orgId, senderPhone })
}
