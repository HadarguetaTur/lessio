/**
 * Manual payment reminder — the "send reminder" button on /billing/debts.
 *
 * Distinct from the dunning cron (`supabase/functions/payment-reminders`), which
 * writes `notification_log` and therefore fires at most once per charge, ever.
 * A person clicking the button is making a deliberate second (or fifth) attempt,
 * so this path is never deduped — it records each send in the charge audit log
 * instead. The opt-out gate still applies: `sendSmartMessage` enforces it.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { decryptToken } from '@/lib/crypto'
import { sendSmartMessage } from '@/lib/whatsapp/sendSmart'
import { resolveRecipientLocale } from '@/lib/i18n/locale'
import { getShareableBaseUrl } from '@/lib/url/appUrl'
import { OPEN_CHARGE_STATUSES, sumRemaining } from '@/lib/charges'
import { logChargeAudit } from '@/lib/charges/audit'
import { logPaymentRequestSent } from './index'

export type ReminderOutcome =
  | 'sent'
  | 'opted_out'
  | 'no_phone'
  | 'no_open_charges'
  | 'whatsapp_not_connected'
  | 'failed'

export async function sendDebtReminderForParent(
  orgId: string,
  parentId: string,
  actorProfileId: string
): Promise<ReminderOutcome> {
  const db = createServiceRoleClient()

  const { data: org } = await db
    .from('organizations')
    .select('whatsapp_phone_number_id, whatsapp_access_token, default_locale')
    .eq('id', orgId)
    .single()

  const encryptedToken = org?.whatsapp_access_token as string | null
  const phoneNumberId = org?.whatsapp_phone_number_id as string | null
  if (!encryptedToken || !phoneNumberId) return 'whatsapp_not_connected'

  const { data: parent } = await db
    .from('parents')
    .select('id, full_name, phone, preferred_locale')
    .eq('id', parentId)
    .eq('organization_id', orgId)
    .single()

  if (!parent?.phone) return 'no_phone'

  const { data: charges, error: chargesError } = await db
    .from('charges')
    .select('id, amount, amount_paid, payment_link, updated_at')
    .eq('organization_id', orgId)
    .eq('parent_id', parentId)
    .in('status', [...OPEN_CHARGE_STATUSES])
    .order('updated_at', { ascending: false })

  if (chargesError) throw new Error(`[sendDebtReminderForParent] ${chargesError.message}`)
  if (!charges || charges.length === 0) return 'no_open_charges'

  const total = sumRemaining(charges)

  // The approved `payment_reminder` template requires a link, and a plain-text
  // fallback outside the 24h window fails with error 131047. When no charge
  // carries a provider link yet, the parent portal is a real place to pay from.
  const paymentLink =
    (charges.find((c) => c.payment_link)?.payment_link as string | undefined) ??
    `${getShareableBaseUrl()}/portal/${orgId}`

  const locale = resolveRecipientLocale({
    stored: parent.preferred_locale as string | null,
    orgDefault: (org?.default_locale as string | null) ?? null,
  })

  const result = await sendSmartMessage({
    orgId,
    phone: parent.phone as string,
    accessToken: decryptToken(encryptedToken),
    phoneNumberId,
    templateType: 'payment_reminder',
    vars: {
      amount: total.toFixed(2),
      payment_link: paymentLink,
    },
    locale,
  })

  if (!result.sent) return 'opted_out'

  const chargeIds = charges.map((c) => c.id as string)
  await logPaymentRequestSent(chargeIds, orgId, actorProfileId)

  await Promise.all(
    chargeIds.map((chargeId) =>
      logChargeAudit({
        organizationId: orgId,
        chargeId,
        parentId,
        eventType: 'reminder_sent',
        actorProfileId,
        metadata: { channel: 'whatsapp', total, charge_count: chargeIds.length },
      })
    )
  )

  console.info('[sendDebtReminderForParent] reminder sent', {
    orgId,
    parentId,
    chargeCount: chargeIds.length,
    total,
  })

  return 'sent'
}
