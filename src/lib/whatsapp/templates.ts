/**
 * Template resolution engine for WhatsApp messages.
 * Per /docs/sprint-16-scope.md § Story 1
 *
 * Usage:
 *   const body = await resolveTemplate(orgId, 'lesson_reminder', {
 *     teacher_name: 'אהרון',
 *     date: 'יום שני, 21.4',
 *     time: '17:00',
 *   })
 *   await sendTextMessage(phone, body, token, phoneNumberId)
 *
 * Variable syntax: {{variable_name}} (double braces, no spaces)
 * Unrecognised variables are left as-is (fail-safe).
 */

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { AppLocale } from '@/lib/i18n/locale'

export type MessageTemplateType =
  | 'booking_link'
  | 'booking_confirmation'
  | 'lesson_reminder'
  | 'payment_reminder'
  | 'payment_request'
  | 'cancellation_confirmation'
  | 'cancellation_admin_alert'
  | 'receipt_notification'
  | 'homework_assignment'
  | 'homework_reminder'
  | 'balance_reply'
  | 'payment_history_reply'
  | 'schedule_reply'
  | 'portal_link_reply'
  | 'homework_graded'
  | 'ai_satisfaction_prompt'
  | 'unknown_intent_fallback'

/**
 * System-default strings per language (used when no custom template is
 * configured). Keys must cover every MessageTemplateType in every locale.
 * Variables are expressed with {{name}} — same syntax as custom templates.
 */
export const DEFAULT_TEMPLATES: Record<AppLocale, Record<MessageTemplateType, string>> = {
  he: {
    booking_link:
      'הנה הקישור לקביעת שיעור 👇\n{{booking_url}}\n\nשימו לב: הקישור בתוקף ל-15 דקות.',
    booking_confirmation:
      '✅ השיעור נקבע!\n\nמורה: {{teacher_name}}\nתאריך: {{date}}\nשעה: {{time}}\n\nנתראה בשיעור 😊',
    lesson_reminder:
      '📅 תזכורת: שיעור עם {{teacher_name}} מתקיים {{date}} בשעה {{time}}.\nנתראה!',
    payment_reminder:
      'היי, תזכורת קטנה 💛\nיש יתרה פתוחה של ₪{{amount}}.\nלתשלום:\n{{payment_link}}\nתודה!',
    payment_request:
      'היי! בקשת תשלום על ₪{{amount}} עבור {{description}}.\nלתשלום מאובטח:\n{{payment_link}}\nתודה 🙏',
    cancellation_confirmation:
      'השיעור בוטל ✅\n\n{{student_name}} עם {{teacher_name}}\n{{date}} בשעה {{time}}{{charge_line}}\n\nלקביעת שיעור חדש אפשר לכתוב "הזמנה".',
    cancellation_admin_alert:
      '🔔 בוטל שיעור דרך וואטסאפ\n\nתלמיד: {{student_name}}\nמורה: {{teacher_name}}\nמועד: {{date}} בשעה {{time}}{{charge_line}}\nמי ביטל: {{parent_phone}}',
    receipt_notification:
      'תודה על התשלום! 🙏\nהקבלה על ₪{{amount}} זמינה כאן:\n{{receipt_url}}',
    homework_assignment:
      '📚 שיעורי בית חדשים: {{title}}\n\n{{body}}{{due_line}}\n\nבהצלחה! 💪',
    homework_reminder:
      '📚 תזכורת: שיעורי הבית "{{title}}" צריכים להיות מוכנים מחר{{due_date_suffix}}.\nבהצלחה!',
    balance_reply:
      'היתרה הנוכחית שלך: ₪{{total}}{{charge_lines}}',
    payment_history_reply:
      'התשלומים האחרונים שלך:{{charge_lines}}',
    schedule_reply:
      '📅 השיעורים הקרובים שלך:\n{{lesson_lines}}',
    portal_link_reply:
      'הקישור לאזור האישי שלך:\n{{portal_url}}\n\nהכניסה עם מספר הטלפון, בלי סיסמה 😊',
    homework_graded:
      'שיעורי הבית "{{title}}" נבדקו! ✅\nציון: {{score}}/100\n{{feedback_line}}',
    ai_satisfaction_prompt:
      'האם התשובה עזרה? אפשר להגיב 👍 או 👎',
    unknown_intent_fallback:
      'היי 👋 לא הצלחתי להבין את הבקשה.\nהנה מה שאפשר לכתוב לי:\n\n• "הזמנה" לקביעת שיעור\n• "ביטול" לביטול שיעור\n• "חוב" לבירור יתרה ותשלום\n• "שיעורים" ללוח השיעורים הקרובים\n• "פורטל" לכניסה לאזור האישי',
  },
  en: {
    booking_link:
      'Here is your link to book a lesson 👇\n{{booking_url}}\n\nHeads up: the link is valid for 15 minutes.',
    booking_confirmation:
      '✅ Your lesson is booked!\n\nTeacher: {{teacher_name}}\nDate: {{date}}\nTime: {{time}}\n\nSee you there 😊',
    lesson_reminder:
      '📅 Reminder: your lesson with {{teacher_name}} is on {{date}} at {{time}}.\nSee you there!',
    payment_reminder:
      'Hi, a small reminder 💛\nYou have an open balance of ₪{{amount}}.\nTo pay:\n{{payment_link}}\nThank you!',
    payment_request:
      'Hi! A payment request for ₪{{amount}} for {{description}}.\nSecure payment:\n{{payment_link}}\nThank you 🙏',
    cancellation_confirmation:
      'Your lesson is cancelled ✅\n\n{{student_name}} with {{teacher_name}}\n{{date}} at {{time}}{{charge_line}}\n\nTo book a new lesson, just write "book".',
    cancellation_admin_alert:
      '🔔 Lesson cancelled via WhatsApp\n\nStudent: {{student_name}}\nTeacher: {{teacher_name}}\nWhen: {{date}} at {{time}}{{charge_line}}\nCancelled by: {{parent_phone}}',
    receipt_notification:
      'Thank you for your payment! 🙏\nYour receipt for ₪{{amount}} is here:\n{{receipt_url}}',
    homework_assignment:
      '📚 New homework: {{title}}\n\n{{body}}{{due_line}}\n\nGood luck! 💪',
    homework_reminder:
      '📚 Reminder: the homework "{{title}}" is due tomorrow{{due_date_suffix}}.\nGood luck!',
    balance_reply:
      'Your current balance: ₪{{total}}{{charge_lines}}',
    payment_history_reply:
      'Your recent payments:{{charge_lines}}',
    schedule_reply:
      '📅 Your upcoming lessons:\n{{lesson_lines}}',
    portal_link_reply:
      'Here is your personal area:\n{{portal_url}}\n\nSign in with your phone number, no password needed 😊',
    homework_graded:
      'The homework "{{title}}" has been graded! ✅\nScore: {{score}}/100\n{{feedback_line}}',
    ai_satisfaction_prompt:
      'Did that help? Feel free to reply 👍 or 👎',
    unknown_intent_fallback:
      'Hi 👋 I did not quite catch that.\nHere is what you can write me:\n\n• "book" to schedule a lesson\n• "cancel" to cancel a lesson\n• "balance" to check what is owed and pay\n• "schedule" for your upcoming lessons\n• "portal" to reach your personal area',
  },
}

/**
 * Pure substitution — exported for testing and preview rendering (client-side safe).
 * Replaces all {{variable_name}} placeholders. Unrecognised variables are left as-is.
 */
export function substituteVars(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  })
}

/**
 * Resolves the message body for the given org, template type and language.
 *
 * Fallback chain, most specific first:
 *   1. Custom row in the requested locale
 *   2. Custom row in Hebrew (orgs that customised before going bilingual)
 *   3. DEFAULT_TEMPLATES[locale][type]
 *   4. DEFAULT_TEMPLATES.he[type]
 * then {{variable}} substitution.
 *
 * Template resolution failure must never block message sending — on any DB
 * error the function catches, logs, and returns the substituted system default.
 */
export async function resolveTemplate(
  orgId: string,
  type: MessageTemplateType,
  vars: Record<string, string>,
  locale: AppLocale = 'he'
): Promise<string> {
  let templateStr = DEFAULT_TEMPLATES[locale]?.[type] ?? DEFAULT_TEMPLATES.he[type]

  try {
    const db = createServiceRoleClient()
    const { data } = await db
      .from('message_templates')
      .select('body_template, locale')
      .eq('organization_id', orgId)
      .eq('type', type)
      .in('locale', locale === 'he' ? ['he'] : [locale, 'he'])

    const rows = (data ?? []) as Array<{ body_template: string; locale: string }>
    const custom =
      rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === 'he')

    if (custom?.body_template) {
      templateStr = custom.body_template
    }
  } catch (err) {
    console.error('[templates] DB error — falling back to default', { orgId, type, locale, err })
  }

  return substituteVars(templateStr, vars)
}

/**
 * Removes the line that holds nothing but {{varName}}, so the URL can move into
 * a CTA button instead of sitting raw in the body.
 *
 * Returns null when the caller must keep the plain-text form:
 *   - the placeholder is missing entirely
 *   - it appears more than once
 *   - it is embedded mid-sentence (an org customised the template) — stripping
 *     the whole line there would mangle their copy
 *
 * The blank line that separated the URL from the following paragraph is
 * collapsed, so 'intro\n{{url}}\n\noutro' becomes 'intro\n\noutro'.
 */
export function stripStandaloneVarLine(template: string, varName: string): string | null {
  const placeholder = `{{${varName}}}`
  const occurrences = template.split(placeholder).length - 1
  if (occurrences !== 1) return null

  const lines = template.split('\n')
  const index = lines.findIndex((line) => line.trim() === placeholder)
  if (index === -1) return null

  lines.splice(index, 1)
  // Collapse the separator blank line the URL used to sit above/below.
  if (lines[index] === '' && lines[index - 1] === '') lines.splice(index, 1)

  return lines.join('\n').trim()
}

/**
 * Available variables per template type, for UI display (settings page hints).
 */
export const TEMPLATE_VARIABLES: Record<MessageTemplateType, string[]> = {
  booking_link: ['booking_url'],
  booking_confirmation: ['teacher_name', 'date', 'time'],
  lesson_reminder: ['teacher_name', 'date', 'time'],
  payment_reminder: ['amount', 'payment_link'],
  payment_request: ['amount', 'description', 'payment_link'],
  cancellation_confirmation: ['student_name', 'teacher_name', 'date', 'time', 'charge_line'],
  cancellation_admin_alert: ['student_name', 'teacher_name', 'date', 'time', 'charge_line', 'parent_phone'],
  receipt_notification: ['amount', 'receipt_url'],
  homework_assignment: ['title', 'body', 'due_line'],
  homework_reminder: ['title', 'due_date_suffix'],
  homework_graded: ['title', 'score', 'feedback_line'],
  balance_reply: ['total', 'charge_lines'],
  payment_history_reply: ['total', 'charge_lines'],
  schedule_reply: ['lesson_lines'],
  portal_link_reply: ['portal_url'],
  ai_satisfaction_prompt: [],
  unknown_intent_fallback: [],
}

/**
 * Hebrew display labels for each template type (for the settings UI).
 */
export const TEMPLATE_LABELS: Record<MessageTemplateType, string> = {
  booking_link: 'קישור הזמנת שיעור',
  booking_confirmation: 'אישור הזמנת שיעור',
  lesson_reminder: 'תזכורת שיעור',
  payment_reminder: 'תזכורת תשלום',
  payment_request: 'בקשת תשלום',
  cancellation_confirmation: 'אישור ביטול שיעור (להורה)',
  cancellation_admin_alert: 'התראת ביטול (למנהל)',
  receipt_notification: 'קבלה לאחר תשלום',
  homework_assignment: 'שיעורי בית חדשים',
  homework_reminder: 'תזכורת שיעורי בית',
  homework_graded: 'ציון על שיעורי בית',
  balance_reply: 'תשובה לשאלת יתרה',
  payment_history_reply: 'תשובה לשאלת היסטוריית תשלומים',
  schedule_reply: 'תשובה לשאלת לוח זמנים',
  portal_link_reply: 'קישור לפורטל האישי',
  ai_satisfaction_prompt: 'בקשת משוב על תשובת AI',
  unknown_intent_fallback: 'הודעת ברירת מחדל (כוונה לא מזוהה)',
}

/**
 * Example variable values for live preview in the settings UI.
 */
export const TEMPLATE_PREVIEW_VARS: Record<MessageTemplateType, Record<string, string>> = {
  booking_link: { booking_url: 'https://app.lessio.co/book/example-token' },
  booking_confirmation: { teacher_name: 'אהרון כהן', date: 'יום שני, 21.4', time: '17:00' },
  lesson_reminder: { teacher_name: 'אהרון כהן', date: 'יום שני, 21.4', time: '17:00' },
  payment_reminder: { amount: '250.00', payment_link: 'https://pay.example.com/abc' },
  payment_request: { amount: '250.00', description: 'שיעור מתמטיקה', payment_link: 'https://pay.example.com/abc' },
  cancellation_confirmation: { student_name: 'דנה', teacher_name: 'אהרון כהן', date: 'יום שני, 21.4', time: '17:00', charge_line: '\nחיוב ביטול מלא: ₪250.00' },
  cancellation_admin_alert: { student_name: 'דנה', teacher_name: 'אהרון כהן', date: 'יום שני, 21.4', time: '17:00', charge_line: '\nחיוב: ₪250.00 (חיוב מלא)', parent_phone: '0501234567' },
  receipt_notification: { amount: '250.00', receipt_url: 'https://hashboniot.co.il/receipt/123' },
  homework_assignment: { title: 'עמ׳ 45–47', body: 'תרגילים 1–10', due_line: '\nלהגשה עד: יום חמישי' },
  homework_reminder: { title: 'עמ׳ 45–47', due_date_suffix: ' (21.4)' },
  homework_graded: { title: 'עמ׳ 45–47', score: '92', feedback_line: 'עבודה מצוינת!' },
  balance_reply: { total: '500.00', charge_lines: '\n₪250.00, לתשלום: https://pay.example.com/1\n₪250.00, לתשלום: https://pay.example.com/2' },
  payment_history_reply: { total: '500.00', charge_lines: '\n21/04/2026: ₪250.00 ✅\n14/04/2026: ₪250.00 ✅' },
  schedule_reply: { lesson_lines: '1. יום שני, 21.4 בשעה 17:00 עם אהרון כהן\n2. יום רביעי, 23.4 בשעה 15:00 עם אהרון כהן' },
  portal_link_reply: { portal_url: 'https://app.lessio.co/portal/org-id' },
  ai_satisfaction_prompt: {},
  unknown_intent_fallback: {},
}
