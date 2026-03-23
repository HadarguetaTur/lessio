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

import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { normalizePhone, PhoneNormalizationError } from '@/lib/phone'
import { signBookingToken } from '@/lib/jwt'
import {
  sendBookingLink,
  sendUnknownParentReply,
  sendCancellationLessonList,
  sendNoEligibleLessonsReply,
  sendInvalidSelectionReply,
  sendCancellationConfirmation,
  sendCancellationAdminAlert,
  parseWebhookPayload,
  hasBookingIntent,
  hasCancellationIntent,
} from '@/lib/whatsapp'
import { upsertLead } from '@/lib/leads'
import {
  getEligibleLessons,
  formatLessonListMessage,
  upsertCancellationSession,
  getActiveCancellationSession,
  deleteCancellationSession,
  executeCancellation,
} from '@/lib/cancellation-flow'

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
    return new NextResponse('Forbidden', { status: 403 })
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

  // Process each message; errors are caught individually to avoid dropping other messages
  for (const msg of messages) {
    await processMessage(msg, request).catch(err => {
      console.error('[whatsapp/webhook] Error processing message', { messageId: msg.messageId, err })
    })
  }

  return new NextResponse('OK', { status: 200 })
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return mismatch === 0
}

async function processMessage(
  msg: {
    from: string
    messageId: string
    text: string
    businessPhoneNumber: string
    phoneNumberId: string
  },
  request: NextRequest
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

  // 5. Resolve org by business phone number
  // The business WhatsApp display_phone_number must match organizations.whatsapp_number
  let orgPhone: string
  try {
    orgPhone = normalizePhone(msg.businessPhoneNumber)
  } catch {
    console.warn('[whatsapp/webhook] Could not normalize business phone — ignoring', { businessPhone: msg.businessPhoneNumber })
    return
  }

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id, whatsapp_token, timezone')
    .eq('whatsapp_number', orgPhone)
    .maybeSingle()

  if (orgError || !org) {
    console.warn('[whatsapp/webhook] No org found for business phone — ignoring')
    return
  }

  const accessToken = (org.whatsapp_token as string | null) ?? process.env.WHATSAPP_ACCESS_TOKEN ?? ''
  const phoneNumberId = msg.phoneNumberId || (process.env.WHATSAPP_PHONE_NUMBER_ID ?? '')

  // 6. Look up parent by phone in this org (before intent check — any message from
  //    an unrecognized sender must create a lead, regardless of intent)
  const { data: parent, error: parentError } = await db
    .from('parents')
    .select('id')
    .eq('organization_id', org.id)
    .eq('phone', senderPhone)
    .eq('is_active', true)
    .maybeSingle()

  if (parentError) {
    console.error('[whatsapp/webhook] DB error looking up parent', { error: parentError })
    return
  }

  if (!parent) {
    // Unknown sender — upsert lead and send fixed reply regardless of message content
    await handleUnknownSender(org.id, senderPhone, msg.text, accessToken, phoneNumberId)
    return
  }

  // 7. Known parent — check for active cancellation session first
  const session = await getActiveCancellationSession(org.id, senderPhone)

  if (session) {
    await handleCancellationSelection(
      parent.id, org.id, senderPhone, msg.text,
      session,
      (org.timezone as string | null) ?? 'Asia/Jerusalem',
      accessToken, phoneNumberId
    )
    return
  }

  // 8. Check cancellation intent
  if (hasCancellationIntent(msg.text)) {
    await handleCancellationIntent(
      parent.id, org.id, senderPhone,
      (org.timezone as string | null) ?? 'Asia/Jerusalem',
      accessToken, phoneNumberId
    )
    return
  }

  // 9. Check booking intent
  if (!hasBookingIntent(msg.text)) {
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
    return
  }

  if (relationships.length === 0) {
    // Accepted Sprint 1 limitation: a parent without linked students cannot receive
    // a booking link because the booking JWT must contain a concrete studentId.
    console.warn('[whatsapp/webhook] Parent has no students — no booking link sent')
    return
  }

  if (relationships.length > 1) {
    // Accepted Sprint 1 limitation: when a parent has multiple students, the system
    // does not guess which student to book for and does not send a link.
    console.warn('[whatsapp/webhook] Parent has multiple students — booking link not sent')
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
  const origin = new URL(request.url).origin
  const bookingUrl = `${origin}/book/${token}`

  // 11. Send booking link via WhatsApp
  await sendBookingLink(senderPhone, bookingUrl, accessToken, phoneNumberId)
  console.info('[whatsapp/webhook] Booking link sent', { messageId: msg.messageId })
}

async function handleUnknownSender(
  organizationId: string,
  phone: string,
  rawMessage: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  // Upsert lead — creates on first contact, updates updated_at only on repeat
  await upsertLead(organizationId, phone, rawMessage).catch(err => {
    console.error('[whatsapp/webhook] Failed to upsert lead', { phone, err })
  })

  // Send fixed reply to unknown sender (Decision #4)
  await sendUnknownParentReply(phone, accessToken, phoneNumberId)
}

async function handleCancellationIntent(
  parentId: string,
  orgId: string,
  senderPhone: string,
  timezone: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const lessons = await getEligibleLessons(orgId, parentId)

  if (lessons.length === 0) {
    await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId)
    return
  }

  const message = formatLessonListMessage(lessons, timezone)
  await upsertCancellationSession(orgId, senderPhone, lessons.map(l => l.id))
  await sendCancellationLessonList(senderPhone, message, accessToken, phoneNumberId)
  console.info('[whatsapp/webhook] Cancellation lesson list sent', { senderPhone })
}

async function handleCancellationSelection(
  parentId: string,
  orgId: string,
  senderPhone: string,
  text: string,
  session: { lesson_ids: string[] },
  timezone: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const num = parseInt(text.trim(), 10)
  const count = session.lesson_ids.length

  if (isNaN(num) || num < 1 || num > count) {
    // Invalid input — keep flow open
    await sendInvalidSelectionReply(senderPhone, accessToken, phoneNumberId)

    // Re-fetch eligible lessons to rebuild the list (lesson may have changed)
    const lessons = await getEligibleLessons(orgId, parentId)
    if (lessons.length === 0) {
      await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId)
      await deleteCancellationSession(orgId, senderPhone)
      return
    }
    const message = formatLessonListMessage(lessons, timezone)
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
      await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId)
      await deleteCancellationSession(orgId, senderPhone)
      return
    }
    const errorMsg = 'השיעור שנבחר אינו זמין עוד לביטול.'
    await sendCancellationLessonList(senderPhone, errorMsg + '\n\n' + formatLessonListMessage(lessons, timezone), accessToken, phoneNumberId)
    await upsertCancellationSession(orgId, senderPhone, lessons.map(l => l.id))
    return
  }

  // Success — delete session
  await deleteCancellationSession(orgId, senderPhone)

  // Notify parent
  await sendCancellationConfirmation(
    senderPhone,
    outcome.studentName,
    outcome.teacherName,
    outcome.lessonStartAt,
    timezone,
    outcome.chargeResult.amount,
    outcome.chargeResult.chargeType,
    accessToken,
    phoneNumberId
  )

  // Notify admin (best-effort — do not throw if admin phone missing)
  const db = createServiceRoleClient()
  const { data: ownerProfile } = await db
    .from('profiles')
    .select('phone')
    .eq('organization_id', orgId)
    .eq('role', 'owner')
    .eq('is_active', true)
    .maybeSingle()

  if (ownerProfile?.phone) {
    await sendCancellationAdminAlert(
      ownerProfile.phone,
      senderPhone,
      outcome.studentName,
      outcome.teacherName,
      outcome.lessonStartAt,
      timezone,
      outcome.chargeResult.amount,
      outcome.chargeResult.chargeType,
      accessToken,
      phoneNumberId
    ).catch(err => {
      console.error('[whatsapp/webhook] Failed to send admin cancellation alert', err)
    })
  }

  console.info('[whatsapp/webhook] Cancellation completed', { selectedLessonId, senderPhone })
}
