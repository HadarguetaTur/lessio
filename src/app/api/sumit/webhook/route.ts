/**
 * Sumit SaaS billing webhook — POST /api/sumit/webhook
 *
 * Sumit's hosted-checkout API (`beginredirect`) has no IPN field: it cannot be
 * told to call us. This route exists for a Sumit *trigger* — an automation
 * configured in Sumit's own UI — and its payload shape is therefore not
 * guaranteed by any published schema, which is why the field readers below are
 * generous and why nothing here trusts the body.
 *
 * The guaranteed safety net for "customer closed the tab before the redirect"
 * is the daily reconciliation (src/lib/saas/renewal.ts), which lists Sumit
 * payments and matches them itself. This route only makes that faster.
 *
 * Security: the payment id in the body is used to look the payment up at Sumit
 * (`completeCheckoutReturn`), and the binding rules decide whether it may
 * activate anything. When SUMIT_WEBHOOK_SECRET is set, a valid
 * `x-sumit-signature` (`sha256=<hex>` over the raw body) is *required* — an
 * unsigned request is rejected. Do not set the secret unless the Sumit trigger
 * can actually send that header.
 *
 * Returns 200 for business no-ops so Sumit does not retry them; 401 only for
 * signature failures.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { completeCheckoutReturn } from '@/lib/saas/checkoutReturn'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function ok(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200 })
}

function fail(reason: string): NextResponse {
  console.error('[sumit/webhook]', reason)
  return NextResponse.json({ ok: false }, { status: 200 })
}

function unauthorized(reason: string): NextResponse {
  console.error('[sumit/webhook]', reason)
  return NextResponse.json({ ok: false }, { status: 401 })
}

/**
 * HMAC-SHA256 over the raw body. Configuring the secret is what turns this
 * route from "anyone may ask us to re-check a payment" into "only Sumit may".
 * It used to pass an unsigned request through, which made the secret decorative.
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.SUMIT_WEBHOOK_SECRET
  if (!secret) return true
  if (!signatureHeader) return false

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const supplied = Buffer.from(signatureHeader)
  const wanted = Buffer.from(expected)
  if (supplied.length !== wanted.length) return false
  try {
    return timingSafeEqual(supplied, wanted)
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

  if (!verifySignature(rawBody, req.headers.get('x-sumit-signature'))) {
    return unauthorized('Signature verification failed')
  }

  let payload: SumitTriggerPayload
  try {
    payload = JSON.parse(rawBody) as SumitTriggerPayload
  } catch {
    return fail('Failed to parse webhook body as JSON')
  }

  const paymentId = readField(payload, ['OG-PaymentID', 'PaymentID', 'ID'])
  const customerId = readField(payload, ['OG-CustomerID', 'CustomerID'])
  const reference = readField(payload, ['OG-ExternalIdentifier', 'ExternalIdentifier'])

  if (!reference) {
    console.info('[sumit/webhook] No external identifier — ignoring', { paymentId })
    return ok()
  }

  // Which org this reference belongs to. The reference is a server-generated
  // UUID stored per org, so a body cannot name an org it did not pay for.
  const db = createServiceRoleClient()
  const { data: sub, error } = await db
    .from('organization_subscriptions')
    .select('organization_id')
    .eq('pending_checkout_reference', reference)
    .eq('status', 'pending_payment')
    .maybeSingle()

  if (error) {
    return fail(`DB lookup failed for reference ${reference}: ${error.message}`)
  }

  if (!sub) {
    console.info('[sumit/webhook] No pending subscription for reference — already activated or unknown', {
      reference,
    })
    return ok()
  }

  const { outcome, refusal } = await completeCheckoutReturn({
    orgId: sub.organization_id,
    query: { paymentId, customerId, externalIdentifier: reference, cancelled: false },
    source: 'webhook',
  })

  console.info('[sumit/webhook] processed', {
    orgId: sub.organization_id,
    reference,
    outcome,
    ...(refusal ? { refusal } : {}),
  })
  return ok()
}
