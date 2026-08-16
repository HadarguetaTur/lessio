/**
 * Meta WhatsApp Cloud API client utilities.
 * Per /docs/sprint-1-scope.md § Booking link generation and dispatch.
 *
 * All functions are server-side only — they use access tokens that must never
 * appear in client components.
 */

import type { AppLocale } from '@/lib/i18n/locale'
import { botString } from './strings'

const META_API_VERSION = 'v19.0'

// ── Meta approved template message component types ────────────────────────────

export type MetaTemplateComponent =
  | { type: 'header'; parameters: MetaTemplateParameter[] }
  | { type: 'body'; parameters: MetaTemplateParameter[] }
  | { type: 'button'; sub_type: 'quick_reply' | 'url'; index: number; parameters: MetaTemplateParameter[] }

export type MetaTemplateParameter =
  | { type: 'text'; text: string }
  | { type: 'currency'; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: 'date_time'; date_time: { fallback_value: string } }

/**
 * Sends a Meta-approved WhatsApp template message.
 * Used when the 24h customer-service window has expired.
 * Per /docs/sprint-23-scope.md § Story 4a.
 */
export async function sendTemplateMessage(
  to: string,
  accessToken: string,
  phoneNumberId: string,
  templateName: string,
  languageCode: string,
  components: MetaTemplateComponent[] = []
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
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components.length > 0 ? components : undefined,
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[whatsapp] Template API error', { to, templateName, status: res.status, detail })
    throw new Error(`WhatsApp template API error ${res.status}: ${detail}`)
  }
}

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
 * Sends the fixed "unrecognized sender" reply.
 * Per /docs/decisions.md #4.
 */
export async function sendUnknownParentReply(
  to: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale = 'he'
): Promise<void> {
  return sendTextMessage(to, botString('unknown_parent', locale), accessToken, phoneNumberId)
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
  phoneNumberId: string,
  locale: AppLocale = 'he'
): Promise<void> {
  return sendTextMessage(to, botString('no_eligible_lessons', locale), accessToken, phoneNumberId)
}

/**
 * Sends an "invalid selection" error + lesson list again.
 */
export async function sendInvalidSelectionReply(
  to: string,
  accessToken: string,
  phoneNumberId: string,
  locale: AppLocale = 'he'
): Promise<void> {
  return sendTextMessage(to, botString('invalid_selection', locale), accessToken, phoneNumberId)
}

export { parseWebhookPayload, hasBookingIntent, hasCancellationIntent } from './parsePayload'
export type { WhatsAppMessage, MetaWebhookPayload } from './parsePayload'

// ── Intent detectors (Sprint 14) ──────────────────────────────────────────────

/**
 * Returns true if the message contains a "homework done" intent.
 * Matches: סיימתי, גמרתי, עשיתי, הכנתי (case-insensitive, anywhere in text)
 */
export function hasHomeworkDoneIntent(text: string): boolean {
  return /סיימתי|גמרתי|עשיתי|הכנתי|\b(done|finished|completed)\b/i.test(text)
}

/**
 * Returns true if the message contains a balance/payment intent.
 * Matches: חוב, כמה אני חייב, יתרה, תשלום עומד
 */
export function hasBalanceIntent(text: string): boolean {
  return /חוב|כמה אני חייב|יתרה|תשלום עומד|\b(balance|debt|owe)\b/i.test(text)
}

/**
 * Returns true if the message contains a schedule query intent.
 * Matches: שיעורים, מתי שיעור, לוז, לו״ז, לוח זמנים
 *
 * English side deliberately omits a bare "lessons": this detector runs BEFORE
 * hasBookingIntent in the webhook, so "book a lesson" must not be swallowed here.
 */
export function hasScheduleIntent(text: string): boolean {
  return /שיעורים|מתי שיעור|לוז|לו״ז|לוח זמנים|\b(schedule|when is my|my lessons|upcoming lessons)\b/i.test(text)
}

/**
 * Returns true if the message contains a receipt/payment history intent.
 * Matches: קבלה, היסטוריה, מה שילמתי, תשלומים
 */
export function hasReceiptIntent(text: string): boolean {
  return /קבלה|היסטוריה|מה שילמתי|תשלומים|\b(receipt|receipts|payment history|what i paid)\b/i.test(text)
}

/**
 * Returns true if the message contains a portal link intent.
 * Matches: פורטל, כניסה לפורטל, אזור אישי, לינק, קישור לפורטל
 */
export function hasPortalIntent(text: string): boolean {
  return /פורטל|כניסה לפורטל|אזור אישי|לינק|קישור לפורטל|\b(portal|my account)\b/i.test(text)
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
  phoneNumberId: string,
  locale: AppLocale = 'he'
): Promise<void> {
  const message = botString('homework_done_teacher_alert', locale, {
    student_name: studentName,
    title: homeworkTitle,
  })
  return sendTextMessage(teacherPhone, message, accessToken, phoneNumberId)
}

