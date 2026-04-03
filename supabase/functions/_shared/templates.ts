/**
 * Template resolution engine for WhatsApp messages — Deno Edge Function version.
 * Per /docs/sprint-16-scope.md § Story 1
 *
 * Functionally identical to src/lib/whatsapp/templates.ts but follows the
 * Deno pattern: the Supabase client is passed in as the first argument rather
 * than constructed inside. DEFAULT_TEMPLATES is duplicated intentionally —
 * Deno Edge Functions cannot import from src/.
 *
 * Variable syntax: {{variable_name}} (double braces, no spaces)
 */

// deno-lint-ignore-file no-explicit-any

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
 * Pure substitution — replaces all {{variable_name}} placeholders.
 * Unrecognised variables are left as-is (fail-safe).
 */
export function substituteVars(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) => {
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
 *
 * @param supabaseClient - Already-constructed Supabase client (Deno pattern)
 * @param orgId          - Organization UUID
 * @param type           - Template type key
 * @param vars           - Variable substitution map
 */
export async function resolveTemplate(
  supabaseClient: any,
  orgId: string,
  type: MessageTemplateType,
  vars: Record<string, string>
): Promise<string> {
  let templateStr = DEFAULT_TEMPLATES[type]

  try {
    const { data } = await supabaseClient
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
    console.error('[templates] DB error — falling back to default', { orgId, type, err: String(err) })
  }

  return substituteVars(templateStr, vars)
}
