/**
 * Template resolution engine for WhatsApp messages — Deno Edge Function version.
 * Per /docs/sprint-16-scope.md § Story 1
 *
 * Functionally identical to src/lib/whatsapp/templates.ts but follows the
 * Deno pattern: the Supabase client is passed in as the first argument rather
 * than constructed inside. DEFAULT_TEMPLATES is duplicated intentionally —
 * Deno Edge Functions cannot import from src/.
 *
 * SYNC: MessageTemplateType and DEFAULT_TEMPLATES must be kept in sync with
 * src/lib/whatsapp/templates.ts — update both files together.
 *
 * Variable syntax: {{variable_name}} (double braces, no spaces)
 */

// deno-lint-ignore-file no-explicit-any

/** Mirrors AppLocale in src/lib/i18n/locale.ts (Deno cannot import from src/). */
export type AppLocale = 'he' | 'en'

export function parseAppLocale(value: string | null | undefined): AppLocale {
  return value === 'en' ? 'en' : 'he'
}

/**
 * Picks the language to write to a recipient in, most specific source first.
 * Mirrors resolveRecipientLocale in src/lib/i18n/locale.ts.
 */
export function resolveRecipientLocale(params: {
  stored?: string | null
  orgDefault?: string | null
}): AppLocale {
  const { stored, orgDefault } = params
  if (stored === 'he' || stored === 'en') return stored
  return parseAppLocale(orgDefault)
}

export type MessageTemplateType =
  | 'booking_link'
  | 'booking_next_week_link'
  | 'booking_confirmation'
  | 'lesson_reminder'
  | 'payment_reminder'
  | 'payment_request'
  | 'cancellation_confirmation'
  | 'cancellation_admin_alert'
  | 'receipt_notification'
  | 'payment_received'
  | 'homework_assignment'
  | 'homework_reminder'
  | 'balance_reply'
  | 'payment_history_reply'
  | 'schedule_reply'
  | 'portal_link_reply'
  | 'homework_graded'
  | 'ai_satisfaction_prompt'
  | 'unknown_intent_fallback'
  | 'lesson_cancelled_by_teacher'
  | 'lesson_rescheduled'
  | 'day_off_decision'
  | 'welcome_notice'

/**
 * System-default strings per language (used when no custom template is
 * configured). Keys must cover every MessageTemplateType in every locale.
 */
export const DEFAULT_TEMPLATES: Record<AppLocale, Record<MessageTemplateType, string>> = {
  he: {
    booking_link:
      'אפשר לקבוע שיעור כאן.\n{{booking_url}}\n\nשימו לב: הקישור בתוקף ל-15 דקות, ואחרי בחירת מועד הוא שמור עבורכם ל-5 דקות עד לאישור.',
    booking_next_week_link:
      'אפשר לקבוע שיעור לשבוע הבא כאן.\n{{booking_url}}\n\nשימו לב: הקישור בתוקף ל-15 דקות, וייפתח ישירות בשבוע הבא.',
    booking_confirmation:
      '✅ השיעור נקבע!\n\nמורה: {{teacher_name}}\nתאריך: {{date}}\nשעה: {{time}}\n\nנתראה בשיעור 😊',
    lesson_reminder:
      '📅 תזכורת: שיעור עם {{teacher_name}} מתקיים {{date}} בשעה {{time}}.\nנתראה!',
    payment_reminder:
      'היי, תזכורת קטנה 💛\nיש יתרה פתוחה של {{amount}}.\nהתשלום מאובטח ולוקח פחות מדקה.\n{{payment_link}}\nתודה!',
    payment_request:
      'היי {{parent_name}} 👋\nבקשת תשלום על סך {{amount}} עבור {{description}}.{{charge_lines}}\nהתשלום מאובטח ולוקח פחות מדקה.\n{{payment_link}}\nתודה 🙏',
    cancellation_confirmation:
      'השיעור בוטל ✅\n\n{{student_name}} עם {{teacher_name}}\n{{date}} בשעה {{time}}{{charge_line}}\n\nלקביעת שיעור חדש אפשר לכתוב "הזמנה".',
    cancellation_admin_alert:
      '🔔 בוטל שיעור דרך וואטסאפ\n\nתלמיד: {{student_name}}\nמורה: {{teacher_name}}\nמועד: {{date}} בשעה {{time}}{{charge_line}}\nמי ביטל: {{parent_phone}}',
    receipt_notification:
      'תודה על התשלום! 🙏\nהקבלה על {{amount}} זמינה כאן:\n{{receipt_url}}',
    payment_received:
      'היי {{parent_name}} 👋\nהתשלום על סך {{amount}} התקבל, תודה רבה! 🙏{{balance_line}}{{receipt_line}}',
    homework_assignment:
      '📚 שיעורי בית חדשים: {{title}}\n\n{{body}}{{due_line}}\n\nבהצלחה! 💪',
    homework_reminder:
      '📚 תזכורת: שיעורי הבית "{{title}}" צריכים להיות מוכנים מחר{{due_date_suffix}}.\nבהצלחה!',
    balance_reply:
      'יתרתך לתשלום היא {{total}}.\n\nלצפייה בפירוט החיוב אפשר להיכנס לאזור האישי.\n{{portal_url}}\n\n{{payment_line}}',
    payment_history_reply:
      'התשלומים האחרונים שלך:{{charge_lines}}',
    schedule_reply:
      '📅 השיעורים הקרובים שלך:\n{{lesson_lines}}',
    portal_link_reply:
      'זה האזור האישי שלך.\n{{portal_url}}\n\nהכניסה עם מספר הטלפון, בלי סיסמה 😊',
    homework_graded:
      'שיעורי הבית "{{title}}" נבדקו! ✅\nציון: {{score}}/100\n{{feedback_line}}\nכל הכבוד על ההשקעה!',
    ai_satisfaction_prompt:
      'האם התשובה עזרה? אפשר להגיב 👍 או 👎',
    unknown_intent_fallback:
      'היי 👋 לא הצלחתי להבין את הבקשה.\nהנה מה שאפשר לכתוב לי:\n\n• "הזמנה" לקביעת שיעור\n• "ביטול" לביטול שיעור\n• "חוב" לבירור יתרה ותשלום\n• "שיעורים" ללוח השיעורים הקרובים\n• "פורטל" לכניסה לאזור האישי',
    lesson_cancelled_by_teacher:
      'עדכון חשוב 🗓️\nהמורה {{teacher_name}} לא זמין/ה בתאריכים {{date_range}}, ולכן השיעורים שנקבעו בתקופה הזו בוטלו.\nלא יבוצע חיוב על השיעורים האלה.\n\nלקביעת מועד חלופי אפשר לכתוב "הזמנה" 😊',
    lesson_rescheduled:
      'עדכון מועד שיעור 🗓️\nהשיעור של {{student_name}} עם {{teacher_name}} הועבר למועד חדש.\nבמקום {{old_date}} בשעה {{old_time}} — {{date}} בשעה {{time}}.\n\nנתראה!',
    day_off_decision:
      'עדכון לגבי בקשת החופש שלך לתאריכים {{date_range}}:\nהבקשה {{decision}}.',
    welcome_notice:
      'שלום! ההודעות בערוץ זה נשלחות מטעם {{org_name}} באמצעות Lessio — תזכורות לשיעורים, שיעורי בית ובקשות תשלום.\nאפשר להפסיק אותן בכל עת בתשובה "הסר".',
  },
  en: {
    booking_link:
      'You can book a lesson here.\n{{booking_url}}\n\nHeads up: the link is valid for 15 minutes, and once you pick a time it is held for you for 5 minutes while you confirm.',
    booking_next_week_link:
      'You can book a lesson for next week here.\n{{booking_url}}\n\nHeads up: the link is valid for 15 minutes and opens directly on next week.',
    booking_confirmation:
      '✅ Your lesson is booked!\n\nTeacher: {{teacher_name}}\nDate: {{date}}\nTime: {{time}}\n\nSee you there 😊',
    lesson_reminder:
      '📅 Reminder: your lesson with {{teacher_name}} is on {{date}} at {{time}}.\nSee you there!',
    payment_reminder:
      'Hi, a small reminder 💛\nYou have an open balance of {{amount}}.\nPaying is secure and takes under a minute.\n{{payment_link}}\nThank you!',
    payment_request:
      'Hi {{parent_name}} 👋\nHere is a payment request for {{amount}}, for {{description}}.{{charge_lines}}\nPaying is secure and takes under a minute.\n{{payment_link}}\nThank you 🙏',
    cancellation_confirmation:
      'Your lesson is cancelled ✅\n\n{{student_name}} with {{teacher_name}}\n{{date}} at {{time}}{{charge_line}}\n\nTo book a new lesson, just write "book".',
    cancellation_admin_alert:
      '🔔 Lesson cancelled via WhatsApp\n\nStudent: {{student_name}}\nTeacher: {{teacher_name}}\nWhen: {{date}} at {{time}}{{charge_line}}\nCancelled by: {{parent_phone}}',
    receipt_notification:
      'Thank you for your payment! 🙏\nYour receipt for {{amount}} is here:\n{{receipt_url}}',
    payment_received:
      'Hi {{parent_name}} 👋\nYour payment of {{amount}} has been received, thank you! 🙏{{balance_line}}{{receipt_line}}',
    homework_assignment:
      '📚 New homework: {{title}}\n\n{{body}}{{due_line}}\n\nGood luck! 💪',
    homework_reminder:
      '📚 Reminder: the homework "{{title}}" is due tomorrow{{due_date_suffix}}.\nGood luck!',
    balance_reply:
      'Your outstanding balance is {{total}}.\n\nTo see the full breakdown, open your personal area.\n{{portal_url}}\n\n{{payment_line}}',
    payment_history_reply:
      'Your recent payments:{{charge_lines}}',
    schedule_reply:
      '📅 Your upcoming lessons:\n{{lesson_lines}}',
    portal_link_reply:
      'This is your personal area.\n{{portal_url}}\n\nSign in with your phone number, no password needed 😊',
    homework_graded:
      'The homework "{{title}}" has been graded! ✅\nScore: {{score}}/100\n{{feedback_line}}\nGreat work, keep it up!',
    ai_satisfaction_prompt:
      'Did that help? Feel free to reply 👍 or 👎',
    unknown_intent_fallback:
      'Hi 👋 I did not quite catch that.\nHere is what you can write me:\n\n• "book" to schedule a lesson\n• "cancel" to cancel a lesson\n• "balance" to check what is owed and pay\n• "schedule" for your upcoming lessons\n• "portal" to reach your personal area',
    lesson_cancelled_by_teacher:
      'An important update 🗓️\n{{teacher_name}} is unavailable on {{date_range}}, so the lessons scheduled in that period have been cancelled.\nYou will not be charged for them.\n\nTo book a new time, just write "book" 😊',
    lesson_rescheduled:
      'Lesson time updated 🗓️\n{{student_name}}\'s lesson with {{teacher_name}} has been moved.\nInstead of {{old_date}} at {{old_time}} — {{date}} at {{time}}.\n\nSee you there!',
    day_off_decision:
      'An update on your time-off request for {{date_range}}:\nthe request was {{decision}}.',
    welcome_notice:
      'Hi! Messages in this chat are sent on behalf of {{org_name}} via Lessio — lesson reminders, homework and payment requests.\nReply "stop" at any time to opt out.',
  },
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
 *
 * @param supabaseClient - Already-constructed Supabase client (Deno pattern)
 * @param orgId          - Organization UUID
 * @param type           - Template type key
 * @param vars           - Variable substitution map
 * @param locale         - Recipient language (defaults to Hebrew)
 */
export async function resolveTemplate(
  supabaseClient: any,
  orgId: string,
  type: MessageTemplateType,
  vars: Record<string, string>,
  locale: AppLocale = 'he'
): Promise<string> {
  let templateStr = DEFAULT_TEMPLATES[locale]?.[type] ?? DEFAULT_TEMPLATES.he[type]

  try {
    // Exact language only — mirrors src/lib/whatsapp/templates.ts. A Hebrew
    // custom row must never stand in for a missing English one.
    const { data } = await supabaseClient
      .from('message_templates')
      .select('body_template')
      .eq('organization_id', orgId)
      .eq('type', type)
      .eq('locale', locale)
      .maybeSingle()

    if (data?.body_template) {
      templateStr = data.body_template
    }
  } catch (err) {
    console.error('[templates] DB error — falling back to default', { orgId, type, locale, err: String(err) })
  }

  return substituteVars(templateStr, vars)
}
