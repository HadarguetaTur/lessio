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
  | 'schedule_reply'
  | 'portal_link_reply'
  | 'unknown_intent_fallback'

/**
 * System-default Hebrew strings (used when no custom template is configured).
 * Keys must cover every MessageTemplateType.
 * Variables are expressed with {{name}} — same syntax as custom templates.
 */
export const DEFAULT_TEMPLATES: Record<MessageTemplateType, string> = {
  booking_link:
    'קבע/י שיעור — לחץ/י על הקישור (בתוקף ל-15 דקות):\n{{booking_url}}',
  booking_confirmation:
    '✅ השיעור נקבע!\nמורה: {{teacher_name}}\nתאריך: {{date}}\nשעה: {{time}}',
  lesson_reminder:
    '📅 תזכורת: שיעור עם {{teacher_name}} {{date}} בשעה {{time}}.',
  payment_reminder:
    '💳 יש לך חוב פתוח של ₪{{amount}}. לתשלום: {{payment_link}}',
  payment_request:
    'בקשת תשלום ₪{{amount}} עבור {{description}}:\n{{payment_link}}',
  cancellation_confirmation:
    '✅ השיעור בוטל.\n{{student_name}} עם {{teacher_name}}\n{{date}}, {{time}}{{charge_line}}',
  cancellation_admin_alert:
    '🔔 ביטול שיעור\nתלמיד: {{student_name}}\nמורה: {{teacher_name}}\n{{date}}, {{time}}{{charge_line}}\nמבטל/ת: {{parent_phone}}',
  receipt_notification:
    'קבלה על תשלום ₪{{amount}}:\n{{receipt_url}}',
  homework_assignment:
    '📚 שיעורי בית חדשים: {{title}}\n{{body}}\n{{due_line}}',
  homework_reminder:
    '📚 תזכורת: שיעורי הבית "{{title}}" צריכים להיות מוכנים מחר{{due_date_suffix}}.',
  balance_reply:
    'היתרה שלך: ₪{{total}}{{charge_lines}}',
  schedule_reply:
    'השיעורים הקרובים שלך:\n{{lesson_lines}}',
  portal_link_reply:
    'קישור לאזור האישי שלך:\n{{portal_url}}\n\nניתן להתחבר עם מספר הטלפון שלך.',
  unknown_intent_fallback:
    'שלום 👋 לא הצלחתי להבין את הבקשה שלך.\nניתן לשלוח:\n• הזמנה — לקביעת שיעור\n• ביטול — לביטול שיעור\n• חוב — לסגירת יתרה\n• שיעורים — ללוח זמנים\n• פורטל — לגישה לאזור האישי',
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
 * Resolves the message body for the given org and template type.
 *
 * 1. Queries message_templates for a custom row.
 * 2. Falls back to DEFAULT_TEMPLATES[type] if no custom row exists.
 * 3. Substitutes {{variable}} placeholders with the provided vars map.
 *
 * Template resolution failure must never block message sending — on any DB
 * error the function catches, logs, and returns the substituted system default.
 */
export async function resolveTemplate(
  orgId: string,
  type: MessageTemplateType,
  vars: Record<string, string>
): Promise<string> {
  let templateStr = DEFAULT_TEMPLATES[type]

  try {
    const db = createServiceRoleClient()
    const { data } = await db
      .from('message_templates')
      .select('body_template')
      .eq('organization_id', orgId)
      .eq('type', type)
      .limit(1)
      .maybeSingle()

    if (data?.body_template) {
      templateStr = data.body_template
    }
  } catch (err) {
    console.error('[templates] DB error — falling back to default', { orgId, type, err })
  }

  return substituteVars(templateStr, vars)
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
  balance_reply: ['total', 'charge_lines'],
  schedule_reply: ['lesson_lines'],
  portal_link_reply: ['portal_url'],
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
  balance_reply: 'תשובה לשאלת יתרה',
  schedule_reply: 'תשובה לשאלת לוח זמנים',
  portal_link_reply: 'קישור לפורטל האישי',
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
  homework_assignment: { title: 'עמ׳ 45–47', body: 'תרגילים 1–10', due_line: 'להגשה עד יום חמישי' },
  homework_reminder: { title: 'עמ׳ 45–47', due_date_suffix: ' (21.4)' },
  balance_reply: { total: '500.00', charge_lines: '\n₪250.00 — קישור לתשלום: https://pay.example.com/1\n₪250.00 — קישור לתשלום: https://pay.example.com/2' },
  schedule_reply: { lesson_lines: '1. יום שני, 21.4 בשעה 17:00 עם אהרון כהן\n2. יום רביעי, 23.4 בשעה 15:00 עם אהרון כהן' },
  portal_link_reply: { portal_url: 'https://app.lessio.co/portal/org-id' },
  unknown_intent_fallback: {},
}
