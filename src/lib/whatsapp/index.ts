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
 * @deprecated Use resolveTemplate('booking_link', ...) + sendTextMessage. Deletion in Sprint 17.
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
 * @deprecated Use resolveTemplate('booking_confirmation', ...) + sendTextMessage. Deletion in Sprint 17.
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
 * @deprecated Use resolveTemplate('cancellation_confirmation', ...) + sendTextMessage. Deletion in Sprint 17.
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
 * @deprecated Use resolveTemplate('cancellation_admin_alert', ...) + sendTextMessage. Deletion in Sprint 17.
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

// ── Intent detectors (Sprint 14) ──────────────────────────────────────────────

/**
 * Returns true if the message contains a "homework done" intent.
 * Matches: סיימתי, גמרתי, עשיתי, הכנתי (case-insensitive, anywhere in text)
 */
export function hasHomeworkDoneIntent(text: string): boolean {
  return /סיימתי|גמרתי|עשיתי|הכנתי/i.test(text)
}

/**
 * Returns true if the message contains a balance/payment intent.
 * Matches: חוב, כמה אני חייב, יתרה, תשלום עומד
 */
export function hasBalanceIntent(text: string): boolean {
  return /חוב|כמה אני חייב|יתרה|תשלום עומד/i.test(text)
}

/**
 * Returns true if the message contains a schedule query intent.
 * Matches: שיעורים, מתי שיעור, לוז, לו״ז, לוח זמנים
 */
export function hasScheduleIntent(text: string): boolean {
  return /שיעורים|מתי שיעור|לוז|לו״ז|לוח זמנים/i.test(text)
}

/**
 * Returns true if the message contains a receipt/payment history intent.
 * Matches: קבלה, היסטוריה, מה שילמתי, תשלומים
 */
export function hasReceiptIntent(text: string): boolean {
  return /קבלה|היסטוריה|מה שילמתי|תשלומים/i.test(text)
}

/**
 * Returns true if the message contains a portal link intent.
 * Matches: פורטל, כניסה לפורטל, אזור אישי, לינק, קישור לפורטל
 */
export function hasPortalIntent(text: string): boolean {
  return /פורטל|כניסה לפורטל|אזור אישי|לינק|קישור לפורטל/i.test(text)
}

// ── Send helpers (Sprint 14) ──────────────────────────────────────────────────

/**
 * Sends a homework done alert to the teacher.
 */
export async function sendHomeworkAlert(
  teacherPhone: string,
  studentName: string,
  homeworkTitle: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message = `✅ ${studentName} סיים/ה את שיעורי הבית: ${homeworkTitle}`
  return sendTextMessage(teacherPhone, message, accessToken, phoneNumberId)
}

/**
 * Sends a homework reminder to the parent/student.
 * @deprecated Use resolveTemplate('homework_reminder', ...) + sendTextMessage. Deletion in Sprint 17.
 */
export async function sendHomeworkReminder(
  phone: string,
  title: string,
  dueDate: string | null,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message = `📚 תזכורת: שיעורי הבית "${title}" צריכים להיות מוכנים מחר${dueDate ? ` (${dueDate})` : ''}.`
  return sendTextMessage(phone, message, accessToken, phoneNumberId)
}

/**
 * Sends the outstanding balance reply to the parent.
 * @deprecated Use resolveTemplate('balance_reply', ...) + sendTextMessage. Deletion in Sprint 17.
 */
export async function sendBalanceReply(
  phone: string,
  total: number,
  charges: { amount: number; paymentLink: string | null }[],
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  let message: string
  if (total === 0) {
    message = 'אין חוב פתוח כרגע 🎉'
  } else {
    const lines = [`היתרה שלך: ₪${total.toFixed(2)}`]
    const topCharges = charges.slice(0, 3)
    for (const c of topCharges) {
      let line = `₪${c.amount.toFixed(2)}`
      if (c.paymentLink) {
        line += ` — קישור לתשלום: ${c.paymentLink}`
      }
      lines.push(line)
    }
    message = lines.join('\n')
  }
  return sendTextMessage(phone, message, accessToken, phoneNumberId)
}

/**
 * Sends the upcoming schedule reply to the parent.
 * @deprecated Use resolveTemplate('schedule_reply', ...) + sendTextMessage. Deletion in Sprint 17.
 */
export async function sendScheduleReply(
  phone: string,
  lessons: { date: string; time: string; teacherName: string }[],
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  let message: string
  if (lessons.length === 0) {
    message = 'אין שיעורים מתוכננים כרגע.'
  } else {
    const lines = lessons.map(
      (l, i) => `${i + 1}. ${l.date} בשעה ${l.time} עם ${l.teacherName}`
    )
    message = 'השיעורים הקרובים שלך:\n' + lines.join('\n')
  }
  return sendTextMessage(phone, message, accessToken, phoneNumberId)
}

/**
 * Sends the payment receipt history reply to the parent.
 * @deprecated Use resolveTemplate('balance_reply', ...) + sendTextMessage. Deletion in Sprint 17.
 */
export async function sendReceiptReply(
  phone: string,
  charges: { date: string; amount: number }[],
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  let message: string
  if (charges.length === 0) {
    message = 'לא נמצאו תשלומים קודמים.'
  } else {
    const lines = charges.map((c) => `${c.date}: ₪${c.amount.toFixed(2)} — שולם`)
    message = 'תשלומים אחרונים:\n' + lines.join('\n')
  }
  return sendTextMessage(phone, message, accessToken, phoneNumberId)
}

/**
 * Sends the portal link to the parent.
 * @deprecated Use resolveTemplate('portal_link_reply', ...) + sendTextMessage. Deletion in Sprint 17.
 */
export async function sendPortalReply(
  phone: string,
  portalUrl: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message = `קישור לאזור האישי שלך:\n${portalUrl}\n\nניתן להתחבר עם מספר הטלפון שלך.`
  return sendTextMessage(phone, message, accessToken, phoneNumberId)
}

/**
 * Sends a receipt notification to the parent after a payment is processed.
 * Per /docs/sprint-15-scope.md § Story 2.
 * @deprecated Use resolveTemplate('receipt_notification', ...) + sendTextMessage. Deletion in Sprint 17.
 */
export async function sendReceiptMessage(
  phone: string,
  amount: number,
  receiptUrl: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message = `קבלה על תשלום ₪${amount.toFixed(2)}:\n${receiptUrl}`
  return sendTextMessage(phone, message, accessToken, phoneNumberId)
}

/**
 * Sends the unknown intent fallback reply to the parent.
 * @deprecated Use resolveTemplate('unknown_intent_fallback', ...) + sendTextMessage. Deletion in Sprint 17.
 */
export async function sendUnknownIntentReply(
  phone: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  const message =
    'שלום 👋 לא הצלחתי להבין את הבקשה שלך.\nניתן לשלוח:\n• הזמנה — לקביעת שיעור\n• ביטול — לביטול שיעור\n• חוב — לסגירת יתרה\n• שיעורים — ללוח זמנים\n• פורטל — לגישה לאזור האישי'
  return sendTextMessage(phone, message, accessToken, phoneNumberId)
}
