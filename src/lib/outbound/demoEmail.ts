/**
 * Send the demo email to a prospect, at most once.
 *
 * Same claim-before-send shape as src/lib/saas/ownerNotify.ts, with the
 * prospect row itself as the ledger: `demo_email_sent_at` is set with a
 * guarded UPDATE before Resend is called, so two replies racing each other
 * cannot both send. A provider failure clears the claim so a later reply (or
 * an operator) can retry; the failed attempt is still logged as a message.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendPlatformEmail } from '@/lib/email'
import { demoEmail } from '@/lib/email/templates/outbound'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { reportError } from '@/lib/telemetry/reportError'
import { scheduleFollowup } from './followups'
import { unsubscribeHeaders, unsubscribeUrl } from './unsubscribe'
import type { Prospect } from './types'

export type DemoEmailOutcome = 'sent' | 'duplicate' | 'failed'

export async function sendDemoEmailOnce(prospect: Prospect): Promise<DemoEmailOutcome> {
  const db = createServiceRoleClient()

  const { data: claimed, error: claimErr } = await db
    .from('outbound_prospects')
    .update({ demo_email_sent_at: new Date().toISOString() })
    .eq('id', prospect.id)
    .is('demo_email_sent_at', null)
    .select('id')
  if (claimErr) {
    console.error('[outbound/demoEmail] claim failed', { prospectId: prospect.id, error: claimErr.message })
    return 'failed'
  }
  if (!claimed || claimed.length === 0) return 'duplicate'

  const email = demoEmail(
    {
      firstName: prospect.first_name,
      signupUrl: `${getShareableBaseUrl()}/signup?ref=outbound`,
      unsubscribeUrl: unsubscribeUrl(prospect.unsubscribe_token),
    },
    prospect.locale === 'en' ? 'en' : 'he'
  )

  const ok = await sendPlatformEmail({
    to: prospect.email,
    subject: email.subject,
    html: email.html,
    headers: unsubscribeHeaders(prospect.unsubscribe_token),
  })

  await db.from('outbound_messages').insert({
    prospect_id: prospect.id,
    direction: 'out',
    kind: 'demo_email',
    transport: 'resend',
    subject: email.subject,
    body: null,
    error: ok ? null : 'provider rejected or not configured',
  })

  if (!ok) {
    // Release the claim so the send can be retried; the message row above
    // keeps the record that this attempt happened.
    await db.from('outbound_prospects').update({ demo_email_sent_at: null }).eq('id', prospect.id)
    await reportError({
      name: 'OutboundDemoEmailFailed',
      message: `demo email to prospect ${prospect.id} was not accepted by the provider`,
      route: '/api/internal/outbound/replies',
      source: 'server',
    })
    return 'failed'
  }

  // The demo is the last thing that happens on its own; from here a follow-up
  // is the only way the conversation continues if they go quiet.
  await db
    .from('outbound_prospects')
    .update({
      followup_stage: 0,
      next_followup_at: scheduleFollowup('interested', 0, new Date())?.toISOString() ?? null,
      followup_claimed_at: null,
      followup_attempts: 0,
    })
    .eq('id', prospect.id)

  return 'sent'
}
