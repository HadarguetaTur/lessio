/**
 * POST /api/v1/charges/{id}/payments — record a payment against a charge.
 *
 * This is the return leg of the `make` payment provider: the org's scenario
 * hears from its processor that a parent paid, and calls this. It is a normal
 * API endpoint rather than a provider webhook because the Bearer key already
 * proves who is calling, which the synchronous RegistryEntry.verifyWebhookRequest
 * hook cannot do (it can't await a per-org secret — see the Stripe TODO in
 * src/lib/payments/registry.ts).
 *
 * Body — every field optional:
 *   amount    number  defaults to the full outstanding balance
 *   method    enum    manual | cash | bank_transfer | provider | other  (default provider)
 *   reference string  processor's transaction id, kept in the payment notes
 *   notes     string
 *   paidAt    ISO 8601
 *
 * Retry safety: a charge that is already paid answers 200 with alreadyPaid:true
 * rather than 409, because a Make scenario that retries on error would otherwise
 * loop forever on a charge that was settled on the first attempt. The trade is
 * deliberate — a second, genuinely different payment against a settled charge is
 * swallowed, which is the correct outcome for a charge that is already closed.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { withApiAuth } from '@/lib/api/handler'
import { apiSuccess, ApiError } from '@/lib/api/respond'
import { recordChargePayment } from '@/lib/charges/payments'
import {
  PAYMENT_METHODS,
  remainingAmount,
  type PaymentMethod,
} from '@/lib/charges/paymentMethods'

const bodySchema = z
  .object({
    amount: z.number().positive().optional(),
    // Cast only to give Zod the tuple shape it needs for a literal union;
    // PAYMENT_METHODS stays the single source of truth.
    method: z.enum(PAYMENT_METHODS as readonly [PaymentMethod, ...PaymentMethod[]]).optional(),
    reference: z.string().min(1).max(200).optional(),
    notes: z.string().max(1000).optional(),
    paidAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()

export const POST = withApiAuth<{ id: string }>(
  'write',
  async ({ req, session, params }): Promise<NextResponse> => {
    const raw = await req.json().catch(() => null)
    if (raw === null) {
      throw new ApiError('invalid_request', 'Body must be valid JSON (send {} for defaults).')
    }

    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new ApiError(
        'invalid_request',
        issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request body.'
      )
    }

    const db = createServiceRoleClient()
    const { data: charge, error } = await db
      .from('charges')
      .select('id, status, amount, amount_paid')
      .eq('id', params.id)
      .eq('organization_id', session.orgId)
      .maybeSingle()

    if (error) {
      console.error('[api/v1/charges/payments] charge lookup failed', {
        orgId: session.orgId,
        chargeId: params.id,
        error: error.message,
      })
      throw new ApiError('internal_error', 'Could not load the charge.')
    }

    // Scoped by organization_id above, so a charge in another org is
    // indistinguishable from one that does not exist — which is the point.
    if (!charge) {
      throw new ApiError('not_found', 'Charge not found.')
    }

    const status = charge.status as string

    if (status === 'paid') {
      return apiSuccess({
        chargeId: charge.id,
        status: 'paid',
        alreadyPaid: true,
        amountPaid: Number(charge.amount_paid ?? 0),
        remaining: 0,
        closed: true,
      })
    }

    if (status === 'waived' || status === 'voided') {
      throw new ApiError(
        'conflict',
        `This charge is ${status} and cannot be paid. Reopen it in Lessio first.`
      )
    }

    const outstanding = remainingAmount(Number(charge.amount), charge.amount_paid)
    const amount = parsed.data.amount ?? outstanding

    if (amount > outstanding) {
      throw new ApiError(
        'invalid_request',
        `Amount ${amount} exceeds the outstanding balance of ${outstanding}.`
      )
    }

    const result = await recordChargePayment({
      chargeId: charge.id,
      organizationId: session.orgId,
      amount,
      // Default 'provider': the money was taken by a real processor on the other
      // side of the org's automation, not handed over in person.
      method: parsed.data.method ?? 'provider',
      notes: buildNotes(parsed.data.notes, parsed.data.reference),
      // No person recorded this.
      actorProfileId: null,
      paidAt: parsed.data.paidAt,
    })

    if (!result.ok) {
      if (result.reason === 'invalid_amount') {
        throw new ApiError(
          'invalid_request',
          `Amount ${amount} is not payable against this charge (outstanding: ${result.remaining ?? outstanding}).`
        )
      }
      if (result.reason === 'not_found') {
        throw new ApiError('not_found', 'Charge not found.')
      }
      if (result.reason === 'not_open') {
        throw new ApiError('conflict', 'This charge is no longer open for payment.')
      }
      throw new ApiError('internal_error', 'Could not record the payment.')
    }

    return apiSuccess({
      chargeId: charge.id,
      status: result.closed ? 'paid' : status,
      alreadyPaid: false,
      amountPaid: result.amountPaid,
      remaining: result.remaining,
      closed: result.closed,
    })
  }
)

/** Keeps the processor's transaction id on the payment row for reconciliation. */
function buildNotes(notes?: string, reference?: string): string | null {
  const parts = [notes?.trim(), reference ? `ref:${reference.trim()}` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : null
}
