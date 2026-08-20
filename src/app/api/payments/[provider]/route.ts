/**
 * Unified payment webhook — POST /api/payments/[provider]
 *
 * A single dynamic route handles webhooks from ALL payment providers.
 * The `[provider]` segment must match the id registered in src/lib/payments/registry.ts.
 *
 * Cardcom:  POST /api/payments/cardcom
 * PayPlus:  POST /api/payments/payplus
 * (future): POST /api/payments/<new-provider>
 *
 * To add support for a new provider's webhook:
 *   1. Add an entry to registry.ts (parseWebhookBody + optional verifyWebhookRequest).
 *   2. Raw body is read once here for optional HMAC verification before JSON parse.
 *
 * All providers receive an HTTP 200 response regardless of outcome.
 * Most providers require a 200 to consider the webhook delivery successful.
 * Errors are logged with org_id and charge IDs for the Data Recovery Playbook.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getRegistryEntry } from '@/lib/payments/registry'
import { issueReceiptForCharge } from '@/lib/receipts/issueReceiptForCharge'

/**
 * Flattens JSON webhook payloads: top-level primitives plus one nested object
 * (e.g. `{ "data": { "transactionId": "..." } }`) into string values for parsers.
 */
function webhookBodyFromPayload(
  rawBody: string,
  contentType: string
): Record<string, string> {
  const ct = contentType.toLowerCase()
  if (ct.includes('application/json')) {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    const flat: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          flat[k2] = v2 === undefined || v2 === null ? '' : String(v2)
        }
      } else {
        flat[k] = v === undefined || v === null ? '' : String(v)
      }
    }
    return flat
  }
  return Object.fromEntries(new URLSearchParams(rawBody))
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await params

  // ── Validate provider is registered ────────────────────────────────────────

  const entry = getRegistryEntry(provider)
  if (!entry) {
    console.error('[payments/webhook] Unknown provider in URL', { provider })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const rawBody = await req.text()

  if (entry.verifyWebhookRequest && !entry.verifyWebhookRequest(req.headers, rawBody)) {
    console.error('[payments/webhook] Webhook verification failed', { provider })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  let body: Record<string, string>
  try {
    const contentType = req.headers.get('content-type') ?? ''
    body = webhookBodyFromPayload(rawBody, contentType)
  } catch (err) {
    console.error('[payments/webhook] Failed to parse request body', { provider, err })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  // ── Extract payment outcome from body via registry ──────────────────────────

  const parsed = entry.parseWebhookBody(body)

  if (!parsed) {
    console.error('[payments/webhook] Could not parse webhook body', { provider, body })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const { reference: paymentReference, isSuccess } = parsed

  if (!isSuccess) {
    console.info('[payments/webhook] Non-success payment event — no action taken', {
      provider,
      paymentReference,
    })
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // ── Look up charges by payment_reference ──────────────────────────────────

  const db = createServiceRoleClient()

  const { data: charges, error: fetchError } = await db
    .from('charges')
    .select('id, organization_id, status')
    .eq('payment_reference', paymentReference)

  if (fetchError) {
    console.error('[payments/webhook] DB lookup failed', {
      provider,
      paymentReference,
      error: fetchError.message,
    })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  if (!charges || charges.length === 0) {
    console.error('[payments/webhook] No charges found for payment_reference', {
      provider,
      paymentReference,
    })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  // ── Mark pending charges as paid (idempotent) ─────────────────────────────

  const chargeIds = charges.map(c => c.id)
  const orgId = charges[0]!.organization_id

  const { error: updateError } = await db
    .from('charges')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', chargeIds)
    .eq('status', 'pending') // idempotent: skip already-paid charges

  if (updateError) {
    console.error('[payments/webhook] Failed to update charge status', {
      provider,
      orgId,
      chargeIds,
      paymentReference,
      error: updateError.message,
    })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  console.info('[payments/webhook] Payment confirmed — charges marked paid', {
    provider,
    orgId,
    chargeIds,
    paymentReference,
  })

  // After the 200 — receipts must not block the provider's callback, but
  // must outlive the lambda.
  await runAfterResponse(
    Promise.all(
      chargeIds.map((chargeId) =>
        issueReceiptForCharge(chargeId, orgId).catch((err) => {
          console.error('[payments/webhook] receipt issuance failed', {
            provider,
            orgId,
            chargeId,
            err,
          })
        })
      )
    )
  )

  return NextResponse.json({ ok: true }, { status: 200 })
}
