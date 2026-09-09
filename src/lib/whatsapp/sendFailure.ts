/**
 * What happens when Meta refuses an outbound message.
 *
 * Every low-level sender used to answer a non-OK Graph response the same way:
 * `console.error` and throw. For a 429 or a malformed body that is right — the
 * caller retries or gives up. For an expired or revoked access token it is not:
 * the connection is dead, every reminder, payment request and bot reply stops,
 * and the owner is told nothing at all. The dashboard went on showing a green
 * "connected" check because nothing wrote the failure down (UX audit F7).
 *
 * So a send failure that means "the token is gone" is escalated here: recorded
 * on the org, where `connectionState` turns it into `reconnect_required`, and
 * raised as an in-app notification to every owner and admin. A business-stopping
 * condition belongs on the dashboard, not in a log nobody reads.
 *
 * Fire-and-forget and never throws — this is always a side note on someone
 * else's failed send, which has its own error to propagate.
 */

import {
  getOwnerAndAdminProfileIds,
  hasRecentUnreadOrgNotification,
  notifyMultiple,
} from '@/lib/notifications'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { parseAppLocale } from '@/lib/i18n/locale'
import { getT } from '@/lib/i18n/serverTranslator'
import { classifyGraphFailure, recordHealthError } from './health'
import { getWaLogContext } from './logContext'

/**
 * At most one "reconnect WhatsApp" alert per org per day. A dead token fails
 * every send, and a studio with fifty reminders queued does not need fifty
 * notifications saying the same sentence.
 */
const ALERT_THROTTLE_HOURS = 24

/**
 * Classifies a failed Graph send and escalates the terminal case.
 *
 * `orgId` is optional because the senders in ./index.ts take a token and a
 * phone_number_id, not an org — it falls back to the ambient WhatsApp log
 * context, which the webhook, sendSmartMessage and the crons all set. With no
 * org in either place there is nobody to tell, and the failure stays a log line.
 */
export async function reportSendFailure(
  status: number,
  body: string,
  orgId?: string | null
): Promise<void> {
  try {
    if (classifyGraphFailure(status, body) !== 'token_invalid') return

    const resolvedOrgId = orgId ?? getWaLogContext()?.orgId ?? null
    if (!resolvedOrgId) {
      console.error('[whatsapp/sendFailure] Token rejected by Meta but no org in scope', { status })
      return
    }

    await recordHealthError(resolvedOrgId, 'token_invalid')

    if (await hasRecentUnreadOrgNotification(resolvedOrgId, 'whatsapp_health', ALERT_THROTTLE_HOURS)) {
      return
    }

    const db = createServiceRoleClient()
    const { data: org } = await db
      .from('organizations')
      .select('default_locale')
      .eq('id', resolvedOrgId)
      .maybeSingle()

    const tn = await getT('notifications', parseAppLocale(org?.default_locale ?? undefined))
    await notifyMultiple(
      resolvedOrgId,
      await getOwnerAndAdminProfileIds(resolvedOrgId),
      'whatsapp_health',
      tn('waTokenExpired'),
      tn('waTokenExpiredBody'),
      '/settings/whatsapp'
    )

    console.error('[whatsapp/sendFailure] WhatsApp token rejected — org notified', {
      orgId: resolvedOrgId,
      status,
    })
  } catch (err) {
    console.warn('[whatsapp/sendFailure] Could not escalate send failure', { status, err })
  }
}
