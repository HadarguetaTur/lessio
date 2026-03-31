/**
 * Meta WhatsApp Cloud API client utilities.
 * Per /docs/sprint-1-scope.md § Booking link generation and dispatch.
 *
 * All functions are server-side only — they use access tokens that must never
 * appear in client components.
 */

const META_API_VERSION = 'v19.0'

export async function sendTextMessage(
  to: string,
  text: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[whatsapp] API error', { to, status: res.status, detail })
    throw new Error(`WhatsApp API error ${res.status}: ${detail}`)
  }
}

/**
 * Sends the booking link to the parent via WhatsApp.
 * The URL is the full WebView booking URL including the JWT token.
 */
export async function sendBookingLink(
  to: string,
  bookingUrl: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message = `קבע/י שיעור — לחץ/י על הקישור (בתוקף ל-15 דקות):\n${bookingUrl}`
  return sendTextMessage(to, message, accessToken, phoneNumberId)
}

/**
 * Sends the booking confirmation message to the parent after a lesson is created.
 * Per Sprint 1 success flow step 12.
 */
export async function sendBookingConfirmation(
  to: string,
  teacherName: string,
  startAt: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const date = new Date(startAt).toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const time = new Date(startAt).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
  const message = `✅ השיעור נקבע!\nמורה: ${teacherName}\nתאריך: ${date}\nשעה: ${time}`
  return sendTextMessage(to, message, accessToken, phoneNumberId)
}

/**
 * Sends the fixed "unrecognized sender" reply.
 * Per /docs/decisions.md #4.
 */
export async function sendUnknownParentReply(
  to: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message =
    'מספרך אינו מזוהה במערכת. אנא פנה/י לבעל העסק לצורך הרשמה.'
  return sendTextMessage(to, message, accessToken, phoneNumberId)
}

/**
 * Sends the numbered lesson list to the parent for cancellation selection.
 */
export async function sendCancellationLessonList(
  to: string,
  message: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  return sendTextMessage(to, message, accessToken, phoneNumberId)
}

/**
 * Sends "no eligible lessons" reply.
 */
export async function sendNoEligibleLessonsReply(
  to: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message = 'לא נמצאו שיעורים מתאימים לביטול (שיעורים מתוכננים ב-7 הימים הקרובים).'
  return sendTextMessage(to, message, accessToken, phoneNumberId)
}

/**
 * Sends an "invalid selection" error + lesson list again.
 */
export async function sendInvalidSelectionReply(
  to: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message = 'קלט לא תקין. אנא השב/י עם מספר השיעור מהרשימה.'
  return sendTextMessage(to, message, accessToken, phoneNumberId)
}

/**
 * Sends a cancellation timeout notice.
 */
export async function sendCancellationTimeoutReply(
  to: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message = 'הזמן לביטול פג. לביטול חדש, שלח/י "ביטול".'
  return sendTextMessage(to, message, accessToken, phoneNumberId)
}

/**
 * Sends cancellation confirmation to the parent.
 */
export async function sendCancellationConfirmation(
  to: string,
  studentName: string,
  teacherName: string,
  lessonStartAt: string,
  timezone: string,
  chargeAmount: number,
  chargeType: 'full' | 'partial' | null,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const date = new Date(lessonStartAt).toLocaleDateString('he-IL', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const time = new Date(lessonStartAt).toLocaleTimeString('he-IL', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  let chargeLine = ''
  if (chargeType && chargeAmount > 0) {
    const label = chargeType === 'full' ? 'חיוב ביטול מלא' : 'חיוב ביטול חלקי'
    chargeLine = `\n${label}: ₪${chargeAmount.toFixed(2)}`
  }

  const message = `✅ השיעור בוטל.\n${studentName} עם ${teacherName}\n${date}, ${time}${chargeLine}`
  return sendTextMessage(to, message, accessToken, phoneNumberId)
}

/**
 * Sends a cancellation alert to the admin/owner phone.
 */
export async function sendCancellationAdminAlert(
  to: string,
  parentPhone: string,
  studentName: string,
  teacherName: string,
  lessonStartAt: string,
  timezone: string,
  chargeAmount: number,
  chargeType: 'full' | 'partial' | null,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const date = new Date(lessonStartAt).toLocaleDateString('he-IL', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const time = new Date(lessonStartAt).toLocaleTimeString('he-IL', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  let chargeLine = ''
  if (chargeType && chargeAmount > 0) {
    const label = chargeType === 'full' ? 'חיוב מלא' : 'חיוב חלקי'
    chargeLine = `\nחיוב: ₪${chargeAmount.toFixed(2)} (${label})`
  } else {
    chargeLine = '\nללא חיוב ביטול'
  }

  const message = `🔔 ביטול שיעור\nתלמיד: ${studentName}\nמורה: ${teacherName}\n${date}, ${time}${chargeLine}\nמבטל/ת: ${parentPhone}`
  return sendTextMessage(to, message, accessToken, phoneNumberId)
}

export { parseWebhookPayload, hasBookingIntent, hasCancellationIntent } from './parsePayload'
export type { WhatsAppMessage, MetaWebhookPayload } from './parsePayload'
