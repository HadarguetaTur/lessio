/**
 * Sumit SaaS billing webhook — POST /api/sumit/webhook
 *
 * Idempotent safety net for the hosted-checkout flow. The authoritative
 * activation path is the redirect-return server-to-server confirmation
 * (src/app/(dashboard)/account/billing/upgrade-actions.ts). This webhook does
 * the same thing for cases where the customer closed the tab before the
 * redirect completed.
 *
 * Security: we NEVER trust the webhook body. We re-confirm the payment with
 * Sumit (`confirmSumitPayment`) before any DB mutation. An optional
 * HMAC-SHA256 signature (SUMIT_WEBHOOK_SECRET, header `x-sumit-signature` as
 * `sha256=<hex>`) is verified when present to drop tampered signed payloads.
 *
 * Always returns HTTP 200 — Sumit retries on non-2xx responses.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { activateSubscriptionFromPayment } from '@/lib/saas/subscriptions'
import { confirmSumitPayment } from '@/lib/saas/sumit'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

function ok(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200 })
}

function fail(reason: string): NextResponse {
  console.error('[sumit/webhook]', reason)
  return NextResponse.json({ ok: false }, { status: 200 })
}

/**
 * Verifies the optional HMAC-SHA256 signature from Sumit.
 *
 * Activation is gated by the server-to-server confirmation, not by this check,
 * so an unsigned request (Sumit triggers may be unsigned) is allowed through —
 * it still cannot activate anything unless Sumit confirms the payment. A
 * *signed* request with a bad signature is rejected.
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.SUMIT_WEBHOOK_SECRET
  if (!secret) return true
  if (!signatureHeader) return true

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
  } catch {
    return false
  }
}

type SumitTriggerPayload = Record<string, unknown> & { Data?: Record<string, unknown> }

/** Reads the first matching string/number field from the payload root or its `Data` envelope. */
function readField(payload: SumitTriggerPayload, keys: string[]): string | null {
  const sources: Array<Record<string, unknown> | undefined> = [payload, payload.Data]
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue
    for (const key of keys) {
      const v = src[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number') return String(v)
    }
  }
  return null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('x-sumit-signature')

  if (!verifySignature(rawBody, signatureHeader)) {
    return fail('Signature verification failed')
  }

  let payload: SumitTriggerPayload
  try {
    payload = JSON.parse(rawBody) as SumitTriggerPayload
  } catch {
    return fail('Failed to parse webhook body as JSON')
  }

  const reference = readField(payload, ['Reference', 'Identifier', 'ExternalReference'])
  const transactionId = readField(payload, ['ID', 'PaymentID', 'TransactionID'])

  if (!reference && !transactionId) {
    console.info('[sumit/webhook] No reference or transaction id — ignoring')
    return ok()
  }

  // Authoritative status — never trust the webhook body.
  const confirmation = await confirmSumitPayment({ transactionId, reference })
  if (!confirmation.valid) {
    console.info('[sumit/webhook] Payment not confirmed valid — no action', { reference, transactionId })
    return ok()
  }

  const lookupRef = reference ?? confirmation.externalReference
  if (!lookupRef) {
    return fail('Confirmed payment has no reference to map to an organization')
  }

  // Idempotency: only a still-pending subscription is activated. If the redirect
  // callback already activated it, the row is no longer pending and this is a no-op.
  const db = createServiceRoleClient()
  const { data: sub, error: subError } = await db
    .from('organization_subscriptions')
    .select('id, organization_id')
    .eq('pending_checkout_reference', lookupRef)
    .eq('status', 'pending_payment')
    .maybeSingle()

  if (subError) {
    return fail(`DB lookup failed for reference ${lookupRef}: ${subError.message}`)
  }

  if (!sub) {
    console.info('[sumit/webhook] No pending subscription for reference — already activated or unknown', {
      reference: lookupRef,
    })
    return ok()
  }

  const activated = await activateSubscriptionFromPayment({
    orgId: sub.organization_id,
    sumitCustomerId: confirmation.customerId,
    sumitPaymentToken: confirmation.paymentToken,
    cardLastFour: confirmation.cardLastFour,
    invoice:
      confirmation.amount != null
        ? {
            amount: confirmation.amount,
            sumitDocumentId: confirmation.documentId,
            sumitDocumentUrl: confirmation.documentUrl,
          }
        : undefined,
  })

  if (!activated) {
    return fail(`activateSubscriptionFromPayment returned false for org ${sub.organization_id}`)
  }

  console.info('[sumit/webhook] Subscription activated (safety net)', {
    orgId: sub.organization_id,
    reference: lookupRef,
  })
  return ok()
}
