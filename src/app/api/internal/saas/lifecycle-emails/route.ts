/**
 * Subscription lifecycle emails — POST /api/internal/saas/lifecycle-emails
 *
 * Daily at 08:00 UTC via pg_cron. Warns owners before a trial ends, tells them
 * when it has, gives notice before a renewal, and confirms a cancellation.
 *
 * In Next.js rather than Deno so it shares one set of email templates with the
 * renewal charger and the checkout receipt.
 */

import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronAuthorization } from '@/lib/cron/auth'
import { runLifecycleEmails } from '@/lib/saas/lifecycleEmails'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  if (!hasValidCronAuthorization(request, { envHashVar: 'LESSIO_SAAS_CRON_SECRET_SHA256' })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await runLifecycleEmails(new Date()))
  } catch (error) {
    console.error('[saas/lifecycle-emails] cron failed', error)
    return NextResponse.json({ error: 'lifecycle email run failed' }, { status: 500 })
  }
}
