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
import { logChargeAudit } from '@/lib/charges/audit'

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
    .select('id, organization_id, status, amount, amount_paid, parent_id')
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

  // A charge waived or voided after the link was minted stays settled: the
  // status filter below skips it, and the audit row records the mismatch so the
  // payment can be reconciled by hand.
  const resolvedCharges = charges.filter(
    (c) => c.status === 'waived' || c.status === 'voided'
  )

  // Per charge rather than one bulk update: each carries its own outstanding
  // balance, which becomes a charge_payments row. The `.eq('status', …)` filter
  // keeps it idempotent — a redelivered webhook updates zero rows.
  const now = new Date().toISOString()
  let updateFailed = false

  for (const charge of charges) {
    const status = charge.status as string
    if (status !== 'pending' && status !== 'invoiced') continue

    const outstanding = Math.max(0, Number(charge.amount) - Number(charge.amount_paid ?? 0))

    const { data: updated, error: updateError } = await db
      .from('charges')
      .update({
        status: 'paid',
        paid_at: now,
        amount_paid: Number(charge.amount),
        updated_at: now,
      })
      .eq('id', charge.id)
      .eq('status', status)
      .select('id')
      .maybeSingle()

    if (updateError) {
      updateFailed = true
      console.error('[payments/webhook] Failed to update charge status', {
        provider,
        orgId,
        chargeId: charge.id,
        paymentReference,
        error: updateError.message,
      })
      continue
    }

    if (!updated || outstanding <= 0) continue

    const { error: paymentError } = await db.from('charge_payments').insert({
      organization_id: charge.organization_id,
      charge_id: charge.id,
      parent_id: (charge.parent_id as string | null) ?? null,
      amount: outstanding,
      method: 'provider',
      paid_at: now,
      notes: `${provider}:${paymentReference}`,
    })

    if (paymentError) {
      console.error('[payments/webhook] Failed to record payment row', {
        provider,
        orgId,
        chargeId: charge.id,
        error: paymentError.message,
      })
    }
  }

  if (updateFailed) {
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  console.info('[payments/webhook] Payment confirmed — charges marked paid', {
    provider,
    orgId,
    chargeIds,
    paymentReference,
  })

  if (resolvedCharges.length > 0) {
    console.warn('[payments/webhook] Payment arrived for a settled charge', {
      provider,
      orgId,
      paymentReference,
      chargeIds: resolvedCharges.map((c) => c.id),
    })
  }

  await Promise.all(
    charges
      .filter((c) => c.status !== 'paid')
      .map((c) =>
        logChargeAudit({
          organizationId: c.organization_id as string,
          chargeId: c.id as string,
          parentId: (c.parent_id as string | null) ?? null,
          eventType: 'webhook_paid',
          beforeStatus: c.status as string,
          afterStatus:
            c.status === 'pending' || c.status === 'invoiced' ? 'paid' : (c.status as string),
          beforeAmount: c.amount == null ? null : Number(c.amount),
          afterAmount: c.amount == null ? null : Number(c.amount),
          metadata: {
            provider,
            payment_reference: paymentReference,
            skipped_terminal: c.status === 'waived' || c.status === 'voided',
          },
        })
      )
  )

  // A consolidated request (one link, several charges) is settled by the same
  // reference — close it so the debtors screen stops offering to resend it.
  const { error: requestError } = await db
    .from('payment_requests')
    .update({ status: 'paid', paid_at: now })
    .eq('payment_reference', paymentReference)
    .eq('status', 'sent')

  if (requestError) {
    console.error('[payments/webhook] Failed to close payment request', {
      provider,
      orgId,
      paymentReference,
      error: requestError.message,
    })
  }

  // After the 200 — receipts must not block the provider's callback, but
  // must outlive the lambda.
  const receiptChargeIds = charges
    .filter((c) => c.status !== 'waived' && c.status !== 'voided')
    .map((c) => c.id as string)

  await runAfterResponse(
    Promise.all(
      receiptChargeIds.map((chargeId) =>
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
