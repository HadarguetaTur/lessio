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
import { resolveChargesForReference } from '@/lib/payments/references'
import {
  SETTLEABLE_STATUSES,
  allocateProviderPayment,
  chargeOutstanding,
  isMissingIdempotencyKey,
} from '@/lib/payments/settlement'
import { round2 } from '@/lib/charges/paymentMethods'

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
  if (!entry.acceptsWebhookSettlement) {
    console.error('[payments/webhook] Provider has no authenticated settlement path', { provider })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const rawBody = await req.text()

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
    if (parsed.isRefund) {
      // Money went back to the parent and Lessio cannot say so: charge_payments
      // has CHECK (amount > 0), so a reversal row is impossible, and amount_paid
      // never decrements. The charge will keep reading as paid. Reported at
      // error level because it needs a person, not because anything failed.
      console.error(
        '[payments/webhook] REFUND reported by the provider — Lessio has no refund ledger, ' +
        'so the charge still reads as paid. Reconcile this one by hand.',
        { provider, paymentReference, amount: parsed.amount }
      )
    } else {
      console.info('[payments/webhook] Non-success payment event — no action taken', {
        provider,
        paymentReference,
      })
    }
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // ── Look up the charges this reference was minted for ─────────────────────
  // Through the reference history, not only the reference a charge carries
  // right now: every resend mints a new link and overwrites that column, and a
  // parent paying last week's message must still be recognised.

  const db = createServiceRoleClient()

  const resolved = await resolveChargesForReference(db, paymentReference)
  const charges = resolved.charges

  if (resolved.error) {
    console.error('[payments/webhook] DB lookup failed', {
      provider,
      paymentReference,
      error: resolved.error,
    })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  if (charges.length === 0) {
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

  // Resolve the org's encrypted provider credentials only after the untrusted
  // reference has identified an org. The callback body is not authoritative.
  let adapter: Awaited<ReturnType<typeof getPaymentProvider>>['provider']
  try {
    adapter = (await getPaymentProvider(charges[0]!.organization_id)).provider
  } catch (err) {
    console.error('[payments/webhook] Failed to resolve payment adapter', { provider, err })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const { data: paymentRequest } = await db
    .from('payment_requests')
    .select('id')
    .eq('payment_reference', paymentReference)
    .maybeSingle()
  const merchantReferences = charges.map((charge) => charge.id as string)
  if (paymentRequest?.id) merchantReferences.push(paymentRequest.id as string)

  // What the parent was asked for, which is not the gross charge total: a link
  // is minted for what is still outstanding, so a charge with ₪50 of cash
  // already recorded goes out at ₪150, and the provider reports ₪150. Checking
  // ₪200 here rejected every such payment and left the dunning cron chasing
  // money that had already arrived.
  const settleable = charges.filter((charge) => SETTLEABLE_STATUSES.has(String(charge.status)))
  const outstandingTotal = round2(
    settleable.reduce((sum, charge) => sum + chargeOutstanding(charge), 0)
  )
  const expectedAmount =
    resolved.mintedAmount ??
    (outstandingTotal > 0
      ? outstandingTotal
      : round2(charges.reduce((sum, charge) => sum + Number(charge.amount), 0)))

  if ((provider === 'stripe' || provider === 'payplus') && (
    parsed.amount === undefined ||
    Math.round(parsed.amount * 100) !== Math.round(expectedAmount * 100) ||
    !parsed.merchantReference ||
    !merchantReferences.includes(parsed.merchantReference)
  )) {
    console.error('[payments/webhook] Authenticated event does not match checkout', {
      provider,
      paymentReference,
    })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const requestVerified = adapter.verifyWebhookRequest
    ? adapter.verifyWebhookRequest(req.headers, rawBody)
    : entry.verifyWebhookRequest
      ? entry.verifyWebhookRequest(req.headers, rawBody)
      : false

  const providerConfirmed = adapter.confirmTransaction
    ? await adapter.confirmTransaction({
        reference: paymentReference,
        expectedAmount,
        chargeIds: merchantReferences,
        body,
      }).catch((err) => {
        console.error('[payments/webhook] Server confirmation failed', { provider, err })
        return false
      })
    : false

  if (!requestVerified && !providerConfirmed) {
    console.error('[payments/webhook] Webhook authenticity/transaction verification failed', {
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
  // Includes 'paid': a callback for a charge someone already settled by hand is
  // the same reconciliation problem — real money that our ledger will not
  // record, because recording it would count it twice.
  const resolvedCharges = charges.filter((c) => !SETTLEABLE_STATUSES.has(String(c.status)))

  // Per charge rather than one bulk update: each absorbs its own share of the
  // payment, which becomes a charge_payments row keyed by (charge, reference) —
  // that unique key, not the charge status, is what makes a redelivery a no-op.
  const now = new Date().toISOString()
  let updateFailed = false

  // What actually arrived. Providers that report an amount are believed; the
  // ones that do not (their callback was already confirmed server-side above)
  // are taken to have collected what the link was minted for.
  const collected = parsed.amount ?? expectedAmount
  const { allocations, surplus } = allocateProviderPayment(
    settleable.map((charge) => ({ id: charge.id, outstanding: chargeOutstanding(charge) })),
    collected
  )
  const allocationByCharge = new Map(allocations.map((a) => [a.chargeId, a.amount]))

  if (surplus > 0) {
    // More money than debt: usually cash recorded by hand after the link went
    // out. The charge cannot absorb it, so it is reported rather than written —
    // a payment row larger than the charge it settles would corrupt every
    // revenue figure that sums charge_payments.
    console.error('[payments/webhook] Payment exceeds the open balance — surplus not recorded', {
      provider,
      orgId,
      paymentReference,
      collected,
      surplus,
      chargeIds: settleable.map((c) => c.id),
    })
  }

  for (const charge of settleable) {
    const share = allocationByCharge.get(charge.id) ?? 0

    if (share > 0) {
      const { error: paymentError } = await db.from('charge_payments').upsert({
        organization_id: charge.organization_id,
        charge_id: charge.id,
        parent_id: (charge.parent_id as string | null) ?? null,
        amount: share,
        method: 'provider',
        paid_at: now,
        notes: `${provider}:${paymentReference}`,
        provider_reference: paymentReference,
      }, {
        onConflict: 'charge_id,provider_reference',
        ignoreDuplicates: true,
      })

      if (paymentError) {
        updateFailed = true
        // A schema without the idempotency key cannot dedupe a redelivery, so
        // settling anyway would either double-count the money or mark a charge
        // paid with no ledger row behind it. Stop, and say why in one line
        // someone can act on.
        if (isMissingIdempotencyKey(paymentError)) {
          console.error(
            '[payments/webhook] FATAL: charge_payments.provider_reference is missing — ' +
            'this environment is behind on migrations and payments cannot be recorded safely. ' +
            'Apply 20260906090000_payment_webhook_idempotency.sql.',
            { provider, orgId, chargeId: charge.id, paymentReference, error: paymentError.message }
          )
        } else {
          console.error('[payments/webhook] Failed to record payment row', {
            provider,
            orgId,
            chargeId: charge.id,
            error: paymentError.message,
          })
        }
        continue
      }
    }

    // amount_paid is a denormalised copy of the ledger, so it is recomputed
    // from the ledger rather than incremented here. That is what makes a
    // duplicate, a late callback, or a retry after an interrupted run converge
    // on the same figure instead of stacking.
    const { data: ledger, error: ledgerError } = await db
      .from('charge_payments')
      .select('amount')
      .eq('charge_id', charge.id)

    if (ledgerError) {
      updateFailed = true
      console.error('[payments/webhook] Failed to read the payment ledger', {
        provider,
        orgId,
        chargeId: charge.id,
        error: ledgerError.message,
      })
      continue
    }

    const recorded = round2(
      ((ledger ?? []) as Array<{ amount: number | string }>).reduce(
        (sum, row) => sum + Number(row.amount),
        0
      )
    )
    const total = Number(charge.amount)
    const settled = recorded + 0.005 >= total

    const update: Record<string, unknown> = {
      amount_paid: Math.min(recorded, total),
      updated_at: now,
    }
    if (settled) {
      update.status = 'paid'
      update.paid_at = now
    }

    const { error: updateError } = await db
      .from('charges')
      .update(update)
      .eq('id', charge.id)
      .eq('status', charge.status)
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
      // Nothing applied to an already-closed charge is nothing to say: a
      // redelivered callback would otherwise write an audit row every time.
      .filter((c) => (allocationByCharge.get(c.id as string) ?? 0) > 0 || c.status !== 'paid')
      .map((c) => {
      const applied = allocationByCharge.get(c.id as string) ?? 0
      const settledNow = applied > 0 && applied + 0.005 >= chargeOutstanding(c)
      return logChargeAudit({
        organizationId: c.organization_id as string,
        chargeId: c.id as string,
        parentId: (c.parent_id as string | null) ?? null,
        eventType: 'webhook_paid',
        beforeStatus: c.status as string,
        afterStatus: settledNow ? 'paid' : (c.status as string),
        beforeAmount: c.amount == null ? null : Number(c.amount),
        afterAmount: c.amount == null ? null : Number(c.amount),
        metadata: {
          provider,
          payment_reference: paymentReference,
          applied,
          collected,
          surplus,
          // The link that was paid is no longer the one this charge carries.
          superseded_reference: resolved.supersededOnly,
          skipped_terminal: !SETTLEABLE_STATUSES.has(String(c.status)),
        },
      })
    })
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
