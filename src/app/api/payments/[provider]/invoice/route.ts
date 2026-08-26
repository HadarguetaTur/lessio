/**
 * Provider-issued invoice webhook — POST /api/payments/[provider]/invoice
 *
 * For providers that issue the tax document themselves and announce it on a
 * channel separate from the payment. Grow is the case this exists for:
 *   POST /api/payments/grow/invoice   { transactionCode, invoiceNumber, invoiceUrl }
 *
 * The body carries no payment reference, so the charge is found through the
 * transaction ids the payment webhook stored on it earlier. That ordering is
 * Grow's, not ours — the invoice event can only follow a payment event.
 *
 * Registered by adding parseInvoiceWebhookBody to a registry entry; a provider
 * without it gets a 200 and nothing else.
 *
 * Always answers HTTP 200: providers treat anything else as a failed delivery
 * and retry, and a retry cannot fix a body we could not match.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { runAfterResponse } from '@/lib/server/afterResponse'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getRegistryEntry } from '@/lib/payments/registry'
import { webhookBodyFromPayload } from '@/lib/payments/webhookBody'
import { recordExternalReceipt } from '@/lib/receipts/recordExternalReceipt'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await params

  const entry = getRegistryEntry(provider)
  if (!entry?.parseInvoiceWebhookBody) {
    console.error('[payments/invoice] Provider does not publish invoice webhooks', { provider })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const rawBody = await req.text()

  let body: Record<string, string>
  try {
    body = webhookBodyFromPayload(rawBody, req.headers.get('content-type') ?? '')
  } catch (err) {
    console.error('[payments/invoice] Failed to parse request body', { provider, err })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const parsed = entry.parseInvoiceWebhookBody(body)
  if (!parsed) {
    console.error('[payments/invoice] Could not parse invoice webhook body', { provider, body })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  const { transactionCode, invoiceUrl, invoiceNumber } = parsed

  // Matched against the whole set of ids the payment webhook stored, because
  // the provider's docs do not say which of them becomes transactionCode.
  const db = createServiceRoleClient()
  const { data: charges, error: fetchError } = await db
    .from('charges')
    .select('id, organization_id')
    .contains('provider_transaction_ids', [transactionCode])

  if (fetchError) {
    console.error('[payments/invoice] DB lookup failed', {
      provider,
      transactionCode,
      error: fetchError.message,
    })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  if (!charges || charges.length === 0) {
    // Loud on purpose: this is where an unexpected transactionCode meaning
    // shows up, and the invoice is otherwise lost silently.
    console.error('[payments/invoice] No charge matches the invoice transaction', {
      provider,
      transactionCode,
      invoiceNumber,
    })
    return NextResponse.json({ ok: false }, { status: 200 })
  }

  // A consolidated request pays several charges off one transaction, so the
  // same document is recorded against each of them.
  await runAfterResponse(
    Promise.all(
      charges.map((charge) =>
        recordExternalReceipt({
          chargeId: charge.id as string,
          orgId: charge.organization_id as string,
          receiptUrl: invoiceUrl,
          documentNumber: invoiceNumber,
        }).catch((err) => {
          console.error('[payments/invoice] Failed to record invoice', {
            provider,
            chargeId: charge.id,
            err,
          })
        })
      )
    )
  )

  return NextResponse.json({ ok: true }, { status: 200 })
}
