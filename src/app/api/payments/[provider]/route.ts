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
import { markChargeRefunded } from '@/lib/charges/refunds'
import { resolveChargesForReference } from '@/lib/payments/references'
import {
  SETTLEABLE_STATUSES,
  allocateProviderPayment,
  chargeOutstanding,
  isMissingIdempotencyKey,
} from '@/lib/payments/settlement'
import type { ReferenceCharge } from '@/lib/payments/settlement'
import { round2 } from '@/lib/charges/paymentMethods'
import { activatePacksForCharges } from '@/lib/billing/packs/activate'
import { confirmCheckoutsForCharges } from '@/lib/booking/checkout'

/**
 * Follow-ups for charges this callback may have closed. Reads the settled state
 * back rather than trusting the loop: a charge a partial payment did not close
 * activates nothing.
 */
async function onChargesSettled(
  db: ReturnType<typeof createServiceRoleClient>,
  orgId: string,
  chargeIds: string[]
): Promise<void> {
  try {
    const { data } = await db
      .from('charges')
      .select('id, charge_type')
      .eq('organization_id', orgId)
      .in('id', chargeIds)
      .eq('status', 'paid')
    const paid = (data ?? []) as Array<{ id: string; charge_type: string }>
    const packChargeIds = paid.filter((c) => c.charge_type === 'pack').map((c) => c.id)
    if (packChargeIds.length > 0) await activatePacksForCharges(packChargeIds)
    // A portal booking held on this payment: issue the card and confirm the
    // lesson while its slot is still held. No-op for every other charge.
    if (paid.length > 0) await confirmCheckoutsForCharges(orgId, paid.map((c) => c.id))
  } catch (err) {
    console.error('[payments/webhook] post-settlement follow-up failed', { orgId, chargeIds, err })
  }
}

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
      // The provider says money went back to the parent. Record the marker so
      // revenue stops counting it and the portal stops calling it paid — the
      // signal used to be detected here and then thrown away. Lessio does not
      // move the money and does not issue the credit note; see
      // src/lib/charges/refunds.ts for what stays manual.
      await recordProviderRefund({ provider, paymentReference, amount: parsed.amount })
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
  // Snapshot state, used only to validate the amount the provider reports. The
  // write path below re-reads instead — see the freshness re-read.
  const settleableAtLookup = charges.filter((charge) =>
    SETTLEABLE_STATUSES.has(String(charge.status))
  )
  const outstandingTotal = round2(
    settleableAtLookup.reduce((sum, charge) => sum + chargeOutstanding(charge), 0)
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
  // ── Freshness re-read ─────────────────────────────────────────────────────
  // Everything above ran against the snapshot taken at `resolveChargesForReference`,
  // and between then and here the handler performed an organizations read, a
  // credential decryption, a payment_requests read and — critically — a network
  // round-trip to the provider (`confirmTransaction`). Seconds, not milliseconds.
  //
  // An owner tapping "mark paid" inside that window sets status='paid' and
  // inserts a method:'manual' charge_payments row. The webhook, still holding
  // its stale 'pending' snapshot, used to upsert a method:'provider' row under a
  // DIFFERENT unique key — ₪400 of charge_payments against a ₪200 charge —
  // while charges.amount_paid stayed correct, so nothing in `charges` revealed
  // it. `markChargeAsPaid` guards on (status, amount_paid); this side now reads
  // the same state so both check the same thing.
  const { data: freshRows, error: freshError } = await db
    .from('charges')
    .select('id, organization_id, parent_id, amount, amount_paid, status')
    .in('id', chargeIds)
    .eq('organization_id', orgId)

  if (freshError) {
    console.error('[payments/webhook] Failed to re-read charge state before settling', {
      provider,
      orgId,
      paymentReference,
      error: freshError.message,
    })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const freshById = new Map(
    ((freshRows ?? []) as ReferenceCharge[]).map((row) => [row.id, row])
  )
  // Fall back to the snapshot only for a row that vanished, which the status
  // filter then treats as unsettleable.
  const currentCharges = charges.map((c) => freshById.get(c.id as string) ?? c)

  const resolvedCharges = currentCharges.filter(
    (c) => !SETTLEABLE_STATUSES.has(String(c.status))
  )
  const settleable = currentCharges.filter((c) => SETTLEABLE_STATUSES.has(String(c.status)))

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

    // Both terms are the state this iteration read and priced against. Guarding
    // on status alone let an owner's "mark paid" land in between: their update
    // moved amount_paid without moving it off a status this WHERE still matched.
    // The zero-row outcome is now looked at rather than discarded.
    const { data: updatedRow, error: updateError } = await db
      .from('charges')
      .update(update)
      .eq('id', charge.id)
      .eq('organization_id', charge.organization_id)
      .eq('status', charge.status)
      .eq('amount_paid', charge.amount_paid ?? 0)
      .select('id')
      .maybeSingle()

    if (!updateError && !updatedRow) {
      // Someone settled this charge between the re-read and here. The ledger row
      // is already written, so the money is not lost — but amount_paid was set
      // by the other writer and may now disagree with SUM(charge_payments).
      updateFailed = true
      console.error(
        '[payments/webhook] Charge changed underneath the settlement — amount_paid not updated. ' +
        'Reconcile charges.amount_paid against SUM(charge_payments) for this charge.',
        {
          provider,
          orgId,
          chargeId: charge.id,
          paymentReference,
          expectedStatus: charge.status,
          expectedAmountPaid: charge.amount_paid ?? 0,
          recorded,
        }
      )
      continue
    }

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

  // Punch cards waiting for this payment become usable, and a portal booking
  // held on it is confirmed (decision #46). Both are idempotent.
  await onChargesSettled(db, orgId, chargeIds)

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

/**
 * Records a provider-reported reversal against the charge it paid.
 *
 * PayPlus's adapter detects refunds (`isRefund` in src/lib/payments/registry.ts)
 * and folds them into `isSuccess: false`. That signal used to be logged and
 * dropped: charge_payments has CHECK (amount > 0) so no reversal row was
 * possible, amount_paid never decremented, and the charge went on reading as
 * paid in the revenue KPI and in the parent portal. It now writes the refund
 * marker instead — see src/lib/charges/refunds.ts for what the marker does and
 * does not do (it does not move money, issue a credit note, or re-open debt).
 *
 * Never throws: a webhook must answer 200 whatever happens here.
 */
async function recordProviderRefund(params: {
  provider: string
  paymentReference: string
  amount: number | null | undefined
}): Promise<void> {
  const { provider, paymentReference } = params
  try {
    const db = createServiceRoleClient()
    const resolved = await resolveChargesForReference(db, paymentReference)

    if (resolved.error || resolved.charges.length === 0) {
      console.error(
        '[payments/webhook] REFUND reported for a reference that resolves to no charge — ' +
        'reconcile by hand.',
        { provider, paymentReference, error: resolved.error ?? null }
      )
      return
    }

    // One reference can cover several charges (a settle-the-balance link). The
    // provider tells us one total, and splitting it across charges would be a
    // guess about which one was reversed. Refuse to guess: log it loudly for a
    // person rather than writing a marker that might be wrong.
    if (resolved.charges.length > 1) {
      console.error(
        '[payments/webhook] REFUND reported for a reference covering several charges — ' +
        'Lessio cannot tell which one was reversed. Record it by hand on /charges.',
        {
          provider,
          paymentReference,
          amount: params.amount ?? null,
          chargeIds: resolved.charges.map((c) => c.id),
        }
      )
      return
    }

    const charge = resolved.charges[0]!
    const result = await markChargeRefunded({
      chargeId: charge.id,
      organizationId: charge.organization_id,
      // Nobody in Lessio did this; the provider reported it.
      actorProfileId: null,
      amount: typeof params.amount === 'number' && params.amount > 0 ? params.amount : null,
      reason: `Refund reported by ${provider}`,
      source: 'provider_webhook',
      paymentReference,
    })

    if (!result.ok && result.reason !== 'already_refunded') {
      console.error('[payments/webhook] REFUND could not be recorded — reconcile by hand.', {
        provider,
        paymentReference,
        chargeId: charge.id,
        reason: result.reason,
      })
      return
    }

    console.warn('[payments/webhook] Refund recorded from a provider callback', {
      provider,
      paymentReference,
      chargeId: charge.id,
      alreadyRecorded: !result.ok,
    })
  } catch (err) {
    console.error('[payments/webhook] REFUND handling threw — reconcile by hand.', {
      provider,
      paymentReference,
      err,
    })
  }
}
