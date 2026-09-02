/**
 * SaaS renewal cron — POST /api/internal/saas/renew
 *
 * Triggered by pg_cron (scripts/setup-crons.sql) every 15 minutes in the
 * small hours. It runs in Next.js rather than as an Edge Function because this
 * runtime owns the Sumit adapter, the email templates and the activation
 * logic; a Deno copy of all three is what the previous plan would have cost.
 *
 * Two jobs, in order:
 *   1. reconcile — paid checkouts whose redirect never came back
 *   2. renew — charge stored cards whose period has ended, with the 0/3/7 ladder
 *
 * `?dryRun=1` charges nothing: it asks Sumit to authorise the card and
 * discards the result. `?orgId=` narrows a run to one organization. Both are
 * for the production cutover, and both still require the bearer token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { hasValidCronAuthorization } from '@/lib/cron/auth'
import { reconcilePendingCheckouts, runRenewalCharges } from '@/lib/saas/renewal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  if (!hasValidCronAuthorization(request, { envHashVar: 'LESSIO_SAAS_CRON_SECRET_SHA256' })) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const orgId = url.searchParams.get('orgId') ?? undefined
  const now = new Date()

  try {
    // Skipped on a dry run: reconciliation activates subscriptions for real.
    const reconciled = dryRun ? null : await reconcilePendingCheckouts(now)
    const renewals = await runRenewalCharges(now, { authoriseOnly: dryRun, orgId })

    return NextResponse.json({ dryRun, reconciled, renewals })
  } catch (error) {
    console.error('[saas/renew] cron failed', error)
    return NextResponse.json({ error: 'saas renewal run failed' }, { status: 500 })
  }
}
