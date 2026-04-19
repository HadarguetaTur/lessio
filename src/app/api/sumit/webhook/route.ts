/**
 * Sumit SaaS billing webhook — POST /api/sumit/webhook
 *
 * Receives payment confirmation events from Sumit for SaaS subscriptions.
 * On success: activates the organization's subscription and records a saas_invoice.
 *
 * Security: HMAC-SHA256 signature verified via SUMIT_WEBHOOK_SECRET.
 * Sumit sends the signature in the `X-Sumit-Signature` header as:
 *   sha256=<hex_digest>
 *
 * Always returns HTTP 200 — Sumit retries on non-2xx responses.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { activateSubscriptionFromPayment } from '@/lib/saas/subscriptions'
import { createSumitDocument } from '@/lib/saas/sumit'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

function ok(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200 })
}

function fail(reason: string): NextResponse {
  console.error('[sumit/webhook]', reason)
  return NextResponse.json({ ok: false }, { status: 200 })
}

/**
 * Verifies the HMAC-SHA256 signature from Sumit.
 * Returns false if the secret is missing (warn but don't crash in dev).
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.SUMIT_WEBHOOK_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return false
    }
    // Dev: allow unsigned requests with a warning
    console.warn('[sumit/webhook] SUMIT_WEBHOOK_SECRET not set — skipping signature check (dev only)')
    return true
  }

  if (!signatureHeader) return false

  // Expected format: "sha256=<hex>"
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`

  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Sumit webhook payload shape (partial — we only use what we need).
 * Sumit sends payment events with a Reference field matching our checkout reference.
 */
interface SumitWebhookPayload {
  /** True when the payment succeeded */
  Success?: boolean
  /** Our checkout reference (pending_checkout_reference in organization_subscriptions) */
  Reference?: string
  /** Sumit's internal document ID (for the invoice) */
  DocumentID?: number
  DocumentURL?: string
  /** Card token for future charges — Sumit may provide this for recurring billing */
  PaymentToken?: string
  CardLastDigits?: string
  /** Customer email (if Sumit returns it) */
  CustomerEmail?: string
  CustomerName?: string
  /** Amount charged in ILS */
  Amount?: number
  /** Sumit customer ID for recurring billing */
  CustomerID?: string | number
  /** Sumit subscription ID if Sumit manages the recurring schedule */
  SubscriptionID?: string | number
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('x-sumit-signature')

  if (!verifySignature(rawBody, signatureHeader)) {
    console.error('[sumit/webhook] Signature verification failed')
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let payload: SumitWebhookPayload
  try {
    payload = JSON.parse(rawBody) as SumitWebhookPayload
  } catch {
    return fail('Failed to parse webhook body as JSON')
  }

  // Only handle successful payment events
  if (!payload.Success) {
    console.info('[sumit/webhook] Non-success event — no action', { reference: payload.Reference })
    return ok()
  }

  const reference = payload.Reference?.trim()
  if (!reference) {
    return fail('Webhook payload missing Reference field')
  }

  // Look up the pending subscription by checkout reference
  const db = createServiceRoleClient()
  const { data: sub, error: subError } = await db
    .from('organization_subscriptions')
    .select('id, organization_id, plan_id, billing_interval')
    .eq('pending_checkout_reference', reference)
    .eq('status', 'pending_payment')
    .maybeSingle()

  if (subError) {
    return fail(`DB lookup failed for reference ${reference}: ${subError.message}`)
  }

  if (!sub) {
    // May be a duplicate delivery — log and return 200
    console.info('[sumit/webhook] No pending subscription found for reference — possible duplicate', { reference })
    return ok()
  }

  const orgId = sub.organization_id

  // Activate the subscription
  const activated = await activateSubscriptionFromPayment({
    orgId,
    sumitCustomerId: payload.CustomerID != null ? String(payload.CustomerID) : null,
    sumitSubscriptionId: payload.SubscriptionID != null ? String(payload.SubscriptionID) : null,
    sumitPaymentToken: payload.PaymentToken ?? null,
    cardLastFour: payload.CardLastDigits ?? null,
    invoice: payload.Amount != null
      ? {
          amount: payload.Amount,
          sumitDocumentId: payload.DocumentID != null ? String(payload.DocumentID) : null,
          sumitDocumentUrl: payload.DocumentURL ?? null,
        }
      : undefined,
  })

  if (!activated) {
    return fail(`activateSubscriptionFromPayment returned false for org ${orgId}`)
  }

  console.info('[sumit/webhook] Subscription activated', { orgId, reference })

  // If Sumit did not generate an invoice document, create one now
  if (!payload.DocumentID && payload.Amount && payload.CustomerName) {
    try {
      const doc = await createSumitDocument({
        customerName: payload.CustomerName,
        customerEmail: payload.CustomerEmail ?? null,
        amount: payload.Amount,
        description: 'LESSIO — מנוי פלטפורמה',
        reference,
      })

      // Update the saas_invoice row with the document details
      await db
        .from('saas_invoices')
        .update({
          sumit_document_id: String(doc.documentId),
          sumit_document_url: doc.documentUrl,
        })
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)

      console.info('[sumit/webhook] Invoice created post-activation', {
        orgId,
        documentId: doc.documentId,
      })
    } catch (err) {
      // Non-fatal — subscription is already activated
      console.error('[sumit/webhook] Failed to create post-activation invoice', {
        orgId,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return ok()
}
