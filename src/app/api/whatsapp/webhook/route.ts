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
import { decryptToken } from '@/lib/crypto'
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
  hasHomeworkDoneIntent,
  hasBalanceIntent,
  hasScheduleIntent,
  hasReceiptIntent,
  hasPortalIntent,
  sendHomeworkAlert,
  sendBalanceReply,
  sendScheduleReply,
  sendReceiptReply,
  sendPortalReply,
  sendUnknownIntentReply,
  sendTextMessage,
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
import { markAssignmentDone } from '@/lib/homework'
import { DateTime } from 'luxon'

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

  // 5. Resolve org by phone_number_id (Meta internal ID).
  // Per /docs/sprint-7-scope.md § Story 4 — routing cutover.
  // phone_number_id is the stable, unique identifier Meta sends on every message.
  if (!msg.phoneNumberId) {
    console.warn('[whatsapp/webhook] No phoneNumberId in message — ignoring')
    return
  }

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id, whatsapp_access_token, timezone')
    .eq('whatsapp_phone_number_id', msg.phoneNumberId)
    .maybeSingle()

  if (orgError || !org) {
    console.warn('[whatsapp/webhook] No org found for phone_number_id — ignoring', { phoneNumberId: msg.phoneNumberId })
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

  // 9a. Homework done intent
  if (hasHomeworkDoneIntent(msg.text)) {
    await handleHomeworkDone(parent.id, org.id, senderPhone, accessToken, phoneNumberId)
    return
  }

  // 9b. Balance query
  if (hasBalanceIntent(msg.text)) {
    await handleBalanceQuery(parent.id, org.id, senderPhone, accessToken, phoneNumberId)
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
      phoneNumberId
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
      phoneNumberId
    )
    return
  }

  // 9e. Portal link
  if (hasPortalIntent(msg.text)) {
    await handlePortalQuery(org.id, senderPhone, accessToken, phoneNumberId)
    return
  }

  // 10. Check booking intent
  if (!hasBookingIntent(msg.text)) {
    // No recognized intent — send polite fallback
    await sendUnknownIntentReply(senderPhone, accessToken, phoneNumberId).catch((err) => {
      console.error('[whatsapp/webhook] Failed to send unknown-intent reply', {
        orgId: org.id,
        senderPhone,
        err,
      })
    })
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
    await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId).catch(err => {
      console.error('[whatsapp/webhook] Failed to send no-eligible-lessons reply', { orgId, senderPhone, err })
    })
    return
  }

  const message = formatLessonListMessage(lessons, timezone)
  await upsertCancellationSession(orgId, senderPhone, lessons.map(l => l.id))
  await sendCancellationLessonList(senderPhone, message, accessToken, phoneNumberId).catch(err => {
    console.error('[whatsapp/webhook] Failed to send cancellation lesson list', { orgId, senderPhone, err })
  })
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
  phoneNumberId: string
): Promise<void> {
  const num = parseInt(text.trim(), 10)
  const count = session.lesson_ids.length

  if (isNaN(num) || num < 1 || num > count) {
    // Invalid input — keep flow open
    await sendInvalidSelectionReply(senderPhone, accessToken, phoneNumberId).catch(err => {
      console.error('[whatsapp/webhook] Failed to send invalid-selection reply', { orgId, senderPhone, err })
    })

    // Re-fetch eligible lessons to rebuild the list (lesson may have changed)
    const lessons = await getEligibleLessons(orgId, parentId)
    if (lessons.length === 0) {
      await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId).catch(err => {
        console.error('[whatsapp/webhook] Failed to send no-eligible-lessons reply', { orgId, senderPhone, err })
      })
      await deleteCancellationSession(orgId, senderPhone)
      return
    }
    const message = formatLessonListMessage(lessons, timezone)
    await upsertCancellationSession(orgId, senderPhone, lessons.map(l => l.id))
    await sendCancellationLessonList(senderPhone, message, accessToken, phoneNumberId).catch(err => {
      console.error('[whatsapp/webhook] Failed to send cancellation lesson list', { orgId, senderPhone, err })
    })
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
      await sendNoEligibleLessonsReply(senderPhone, accessToken, phoneNumberId).catch(err => {
        console.error('[whatsapp/webhook] Failed to send no-eligible-lessons reply', { orgId, senderPhone, err })
      })
      await deleteCancellationSession(orgId, senderPhone)
      return
    }
    const errorMsg = 'השיעור שנבחר אינו זמין עוד לביטול.'
    await sendCancellationLessonList(senderPhone, errorMsg + '\n\n' + formatLessonListMessage(lessons, timezone), accessToken, phoneNumberId).catch(err => {
      console.error('[whatsapp/webhook] Failed to send cancellation lesson list', { orgId, senderPhone, err })
    })
    await upsertCancellationSession(orgId, senderPhone, lessons.map(l => l.id))
    return
  }

  // Success — delete session
  await deleteCancellationSession(orgId, senderPhone)

  // Notify parent — WhatsApp failure must not roll back the completed cancellation
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
  ).catch(err => {
    console.error('[whatsapp/webhook] Failed to send cancellation confirmation — cancellation committed', { orgId, senderPhone, lessonId: selectedLessonId, err })
  })

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
    return []
  }
  return (data ?? []).map((r: { student_id: string }) => r.student_id)
}

// ── Sprint 14: new intent handlers ────────────────────────────────────────────

async function handleHomeworkDone(
  parentId: string,
  orgId: string,
  senderPhone: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const db = createServiceRoleClient()

  const studentIds = await getParentStudentIds(db, orgId, parentId)
  if (studentIds.length === 0) {
    await sendTextMessage(
      senderPhone,
      'לא נמצאו שיעורי בית פתוחים לסימון.',
      accessToken,
      phoneNumberId
    ).catch((err) => {
      console.error('[whatsapp/webhook] handleHomeworkDone: failed to send reply', { orgId, senderPhone, err })
    })
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
    return
  }

  if (!assignments || assignments.length === 0) {
    await sendTextMessage(
      senderPhone,
      'לא נמצאו שיעורי בית פתוחים לסימון.',
      accessToken,
      phoneNumberId
    ).catch((err) => {
      console.error('[whatsapp/webhook] handleHomeworkDone: failed to send reply', { orgId, senderPhone, err })
    })
    return
  }

  type AssignmentRow = { id: string; title: string; student_id: string; teacher_id: string }
  const assignment = assignments[0] as AssignmentRow

  // Mark as done
  await markAssignmentDone({ assignmentId: assignment.id, organizationId: orgId }).catch((err) => {
    console.error('[whatsapp/webhook] handleHomeworkDone: markAssignmentDone failed', { assignmentId: assignment.id, err })
  })

  // Get student name
  const { data: student } = await db
    .from('students')
    .select('full_name')
    .eq('id', assignment.student_id)
    .single()

  const studentName = (student as { full_name: string } | null)?.full_name ?? 'התלמיד'

  // Notify teacher
  const { data: teacherProfile } = await db
    .from('teachers')
    .select('profiles ( phone )')
    .eq('id', assignment.teacher_id)
    .single()

  const teacherPhone = (
    teacherProfile as { profiles: { phone: string | null } | null } | null
  )?.profiles?.phone

  if (teacherPhone) {
    await sendHomeworkAlert(teacherPhone, studentName, assignment.title, accessToken, phoneNumberId).catch((err) => {
      console.error('[whatsapp/webhook] handleHomeworkDone: sendHomeworkAlert failed', { orgId, err })
    })
  }

  // Reply to parent
  await sendTextMessage(
    senderPhone,
    `מעולה! שיעורי הבית של ${studentName} סומנו כהושלמו 🎉`,
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
  phoneNumberId: string
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
    return
  }

  const chargeRows = (charges ?? []) as Array<{ amount: number; payment_link: string | null }>
  const total = chargeRows.reduce((sum, c) => sum + c.amount, 0)
  const topCharges = chargeRows.slice(0, 3).map((c) => ({
    amount: c.amount,
    paymentLink: c.payment_link,
  }))

  await sendBalanceReply(senderPhone, total, topCharges, accessToken, phoneNumberId).catch((err) => {
    console.error('[whatsapp/webhook] handleBalanceQuery: sendBalanceReply failed', { orgId, senderPhone, err })
  })

  console.info('[whatsapp/webhook] Balance query replied', { orgId, senderPhone, total })
}

async function handleScheduleQuery(
  parentId: string,
  orgId: string,
  senderPhone: string,
  timezone: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const db = createServiceRoleClient()

  const studentIds = await getParentStudentIds(db, orgId, parentId)
  if (studentIds.length === 0) {
    await sendScheduleReply(senderPhone, [], accessToken, phoneNumberId).catch(() => {})
    return
  }

  // Get lesson IDs for these students
  const { data: lessonStudents, error: lsError } = await db
    .from('lesson_students')
    .select('lesson_id')
    .in('student_id', studentIds)
    .eq('organization_id', orgId)

  if (lsError || !lessonStudents || lessonStudents.length === 0) {
    await sendScheduleReply(senderPhone, [], accessToken, phoneNumberId).catch(() => {})
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
    return
  }

  type LessonRow = {
    start_at: string
    teachers: { profiles: { full_name: string } | null } | null
  }

  const formatted = (lessons ?? []).map((l) => {
    const row = l as LessonRow
    const dt = DateTime.fromISO(row.start_at, { zone: 'utc' }).setZone(timezone)
    return {
      date: dt.toFormat('EEEE, d בMMMM', { locale: 'he' }),
      time: dt.toFormat('HH:mm'),
      teacherName: (row.teachers?.profiles as { full_name: string } | null)?.full_name ?? 'המורה',
    }
  })

  await sendScheduleReply(senderPhone, formatted, accessToken, phoneNumberId).catch((err) => {
    console.error('[whatsapp/webhook] handleScheduleQuery: sendScheduleReply failed', { orgId, senderPhone, err })
  })

  console.info('[whatsapp/webhook] Schedule query replied', { orgId, senderPhone })
}

async function handleReceiptQuery(
  parentId: string,
  orgId: string,
  senderPhone: string,
  timezone: string,
  accessToken: string,
  phoneNumberId: string
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
    return
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

  await sendReceiptReply(senderPhone, formatted, accessToken, phoneNumberId).catch((err) => {
    console.error('[whatsapp/webhook] handleReceiptQuery: sendReceiptReply failed', { orgId, senderPhone, err })
  })

  console.info('[whatsapp/webhook] Receipt query replied', { orgId, senderPhone })
}

async function handlePortalQuery(
  orgId: string,
  senderPhone: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const portalUrl = `${appUrl}/portal/${orgId}`

  await sendPortalReply(senderPhone, portalUrl, accessToken, phoneNumberId).catch((err) => {
    console.error('[whatsapp/webhook] handlePortalQuery: sendPortalReply failed', { orgId, senderPhone, err })
  })

  console.info('[whatsapp/webhook] Portal query replied', { orgId, senderPhone })
}
