import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  activateSubscriptionFromPayment,
  markOrganizationOnboardingComplete,
} from '@/lib/saas/subscriptions'

export const runtime = 'nodejs'

const WebhookBody = z.object({
  organizationId: z.string().uuid(),
  reference: z.string().optional(),
  amount: z.number().optional(),
  sumitCustomerId: z.string().optional(),
  sumitSubscriptionId: z.string().optional(),
  sumitPaymentToken: z.string().optional(),
  cardLastFour: z.string().optional(),
  sumitDocumentId: z.string().optional(),
  sumitDocumentUrl: z.string().optional(),
})

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signatureHeader.trim(), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Sumit → LESSIO: payment succeeded for SaaS subscription.
 * Configure the same JSON shape in Sumit (or map in a thin proxy) and set SUMIT_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const secret = process.env.SUMIT_WEBHOOK_SECRET?.trim()

  if (secret) {
    const sig = req.headers.get('x-sumit-signature') ?? req.headers.get('X-Sumit-Signature')
    if (!verifySignature(raw, sig, secret)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'SUMIT_WEBHOOK_SECRET not configured' }, { status: 500 })
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = WebhookBody.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  const p = parsed.data

  try {
    await activateSubscriptionFromPayment({
      orgId: p.organizationId,
      sumitCustomerId: p.sumitCustomerId ?? null,
      sumitSubscriptionId: p.sumitSubscriptionId ?? null,
      sumitPaymentToken: p.sumitPaymentToken ?? null,
      cardLastFour: p.cardLastFour ?? null,
      invoice:
        p.amount != null
          ? {
              amount: p.amount,
              sumitDocumentId: p.sumitDocumentId ?? null,
              sumitDocumentUrl: p.sumitDocumentUrl ?? null,
            }
          : undefined,
    })
    await markOrganizationOnboardingComplete(p.organizationId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[sumit-saas webhook]', msg)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
