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
import { DateTime } from 'luxon'
import { getWeeklyQuotaStatus } from '@/lib/booking'
import { getEligibleLessons } from '@/lib/cancellation-flow'
import { sendTextMessage } from '@/lib/whatsapp'
import { sendReplyButtons } from '@/lib/whatsapp/interactive'
import { encodeMenuPayload } from '@/lib/whatsapp/menu'
import { botString } from '@/lib/whatsapp/strings'
import type { AppLocale } from '@/lib/i18n/locale'
import { studentDisplayName } from './shared'

export async function notifyIfWeeklyQuotaReached(params: {
  orgId: string
  parentId: string
  studentId: string
  senderPhone: string
  accessToken: string
  phoneNumberId: string
  locale: AppLocale
}): Promise<{ atQuota: boolean; nextWeekStart?: string }> {
  const { orgId, parentId, studentId, senderPhone, accessToken, phoneNumberId, locale } = params

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
    return { atQuota: false }
  }

  if (!atQuota) return { atQuota: false }

  const db = createServiceRoleClient()
  const studentName = await studentDisplayName(db, orgId, studentId, locale)
  const [cancellableLessons, orgResult] = await Promise.all([
    getEligibleLessons(orgId, parentId, [studentId]),
    db.from('organizations').select('timezone').eq('id', orgId).single(),
  ])
  const timezone = orgResult.data?.timezone ?? 'UTC'
  const nowLocal = DateTime.now().setZone(timezone)
  const nextWeekStart = nowLocal
    .minus({ days: nowLocal.weekday % 7 })
    .startOf('day')
    .plus({ weeks: 1 })
    .toISODate()!
  const hasCancellableLesson = cancellableLessons.length > 0

  if (hasCancellableLesson) {
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
  } else {
    // A past lesson still consumes the weekly allowance, but can no longer be
    // cancelled. Never offer a button that must lead to an empty list.
    await sendTextMessage(
      senderPhone,
      botString('booking_quota_reached_no_cancel', locale, { student_name: studentName }),
      accessToken,
      phoneNumberId
    ).catch((err) => {
      console.error('[whatsapp/webhook] failed to send quota notice', { orgId, studentId, err })
    })
  }

  return { atQuota: true, nextWeekStart }
}
