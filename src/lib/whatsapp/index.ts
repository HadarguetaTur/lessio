/**
 * Meta WhatsApp Cloud API client utilities.
 * Per /docs/sprint-1-scope.md § Booking link generation and dispatch.
 *
 * All functions are server-side only — they use access tokens that must never
 * appear in client components.
 */

const META_API_VERSION = 'v19.0'

async function sendTextMessage(
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

export { parseWebhookPayload, hasBookingIntent } from './parsePayload'
export type { WhatsAppMessage, MetaWebhookPayload } from './parsePayload'
