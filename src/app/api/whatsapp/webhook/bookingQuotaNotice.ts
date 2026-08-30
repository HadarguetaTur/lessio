/**
 * The bot's side of the weekly quota.
 *
 * Booking always happens in the WebView, so the bot cannot block anything — it
 * warns instead: when the student has already used up the current week, the
 * parent gets the reason plus a tappable way into the cancellation flow, and
 * still gets the booking link, because later weeks are open and the calendar
 * hides only the weeks that are full.
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getWeeklyQuotaStatus } from '@/lib/booking'
import { sendReplyButtons } from '@/lib/whatsapp/interactive'
import { encodeMenuPayload } from '@/lib/whatsapp/menu'
import { botString } from '@/lib/whatsapp/strings'
import type { AppLocale } from '@/lib/i18n/locale'
import { studentDisplayName } from './shared'

export async function notifyIfWeeklyQuotaReached(params: {
  orgId: string
  studentId: string
  senderPhone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
}): Promise<boolean> {
  const { orgId, studentId, senderPhone, accessToken, phoneNumberId, locale } = params

  let atQuota: boolean
  try {
    ;({ atQuota } = await getWeeklyQuotaStatus({
      studentId,
      organizationId: orgId,
      slotStartUtc: new Date().toISOString(),
    }))
  } catch (err) {
    // A quota lookup failure must not cost the parent their booking link.
    console.error('[whatsapp/webhook] weekly quota check failed', { orgId, studentId, err })
    return false
  }

  if (!atQuota) return false

  const db = createServiceRoleClient()
  const studentName = await studentDisplayName(db, orgId, studentId, locale)

  await sendReplyButtons(
    senderPhone,
    {
      body: botString('booking_quota_reached', locale, { student_name: studentName }),
      buttons: [
        {
          id: encodeMenuPayload('cancel'),
          title: botString('booking_quota_cancel_button', locale),
        },
      ],
    },
    accessToken,
    phoneNumberId
  ).catch((err) => {
    console.error('[whatsapp/webhook] failed to send quota notice', { orgId, studentId, err })
  })

  return true
}
