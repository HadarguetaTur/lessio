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
import { sendBookingLink, sendUnknownParentReply, parseWebhookPayload, hasBookingIntent } from '@/lib/whatsapp'
import { upsertLead } from '@/lib/leads'

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
  msg: { from: string; messageId: string; text: string; businessPhoneNumber: string },
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
    .select('id, whatsapp_token')
    .eq('whatsapp_number', orgPhone)
    .maybeSingle()

  if (orgError || !org) {
    console.warn('[whatsapp/webhook] No org found for business phone — ignoring')
    return
  }

  const accessToken = (org.whatsapp_token as string | null) ?? process.env.WHATSAPP_ACCESS_TOKEN ?? ''
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? ''

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

  // 7. Known parent — check booking intent
  if (!hasBookingIntent(msg.text)) {
    // Sprint 4: cancellation and payment intent handled in later stories (DEV-102)
    return
  }

  // 8. Resolve student for this parent
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
