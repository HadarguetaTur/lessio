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
 *   1. Add an entry to registry.ts with a parseWebhookBody implementation.
 *   2. No changes needed here.
 *
 * All providers receive an HTTP 200 response regardless of outcome.
 * Most providers require a 200 to consider the webhook delivery successful.
 * Errors are logged with org_id and charge IDs for the Data Recovery Playbook.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getRegistryEntry } from '@/lib/payments/registry'

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

  // ── Parse body (JSON or form-encoded) ──────────────────────────────────────

  let body: Record<string, string>
  try {
    const contentType = req.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      body = (await req.json()) as Record<string, string>
    } else {
      const text = await req.text()
      body = Object.fromEntries(new URLSearchParams(text))
    }
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

  return NextResponse.json({ ok: true }, { status: 200 })
}
