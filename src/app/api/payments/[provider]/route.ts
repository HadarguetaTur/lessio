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
import { webhookBodyFromPayload } from '@/lib/payments/webhookBody'
import { getPaymentProvider } from '@/lib/payments/factory'
import { issueReceiptForCharge } from '@/lib/receipts/issueReceiptForCharge'
import { logChargeAudit } from '@/lib/charges/audit'

/**
 * Confirms receipt of the notification back to the provider, for the ones that
 * require it. Resolving the adapter through the factory keeps this route
 * provider-agnostic: an adapter with no acknowledgeWebhook is a no-op.
 */
async function acknowledgeWebhook(
  orgId: string,
  provider: string,
  body: Record<string, string>
): Promise<void> {
  try {
    const { provider: adapter } = await getPaymentProvider(orgId)
    await adapter.acknowledgeWebhook?.(body)
  } catch (err) {
    console.error('[payments/webhook] provider acknowledgement failed', {
      provider,
      orgId,
      err,
    })
  }
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

  // A payment reference identifies a checkout; it does not prove payment.
  // Fail closed for providers whose generic callback is not cryptographically
  // authenticated. They must use a server-confirmed or API-key settlement path.
  if (!entry.acceptsWebhookSettlement || !entry.verifyWebhookRequest) {
    console.error('[payments/webhook] Provider has no authenticated settlement path', { provider })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const rawBody = await req.text()

  if (!entry.verifyWebhookRequest(req.headers, rawBody)) {
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
    console.error('[payments/webhook] Could not parse webhook body', { provider })
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

  if (charges.some((charge) => charge.organization_id !== charges[0]!.organization_id)) {
    console.error('[payments/webhook] Reference spans organizations', { provider, paymentReference })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const { data: org } = await db
    .from('organizations')
    .select('payment_provider')
    .eq('id', charges[0]!.organization_id)
    .maybeSingle()
  if (org?.payment_provider !== provider) {
    console.error('[payments/webhook] Provider mismatch', {
      provider,
      orgId: charges[0]!.organization_id,
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

  // Some providers issue the tax document themselves and announce it later on a
  // separate webhook keyed by a transaction id rather than by our payment
  // reference. Keep every id they gave us so that event can find its charge.
  const transactionIds = entry.webhookTransactionIds?.(body) ?? []
  if (transactionIds.length > 0) {
    const { error: idsError } = await db
      .from('charges')
      .update({ provider_transaction_ids: transactionIds })
      .in('id', chargeIds)

    if (idsError) {
      console.error('[payments/webhook] Failed to store provider transaction ids', {
        provider,
        orgId,
        paymentReference,
        error: idsError.message,
      })
    }
  }

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
    Promise.all([
      ...receiptChargeIds.map((chargeId) =>
        issueReceiptForCharge(chargeId, orgId).catch((err) => {
          console.error('[payments/webhook] receipt issuance failed', {
            provider,
            orgId,
            chargeId,
            err,
          })
        })
      ),
      // Providers that require the merchant to confirm receipt of the
      // notification (Grow's approveTransaction) do it here, with the org's own
      // credentials resolved by the factory.
      acknowledgeWebhook(orgId, provider, body),
    ])
  )

  return NextResponse.json({ ok: true }, { status: 200 })
}
