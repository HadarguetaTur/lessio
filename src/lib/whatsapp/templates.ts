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
 * Variables are expressed with {{name}} — same syntax as custom templates.
 *
 * Two rules these bodies must keep, both enforced by templateCopy.test.ts:
 *
 * 1. A body whose URL line can be lifted into a CTA button must still read as
 *    correct copy with that line gone. Introduce the link with a full sentence,
 *    never a label ending in ':' or '👇' — otherwise stripping the URL leaves
 *    the label dangling directly above a button that says the same words.
 * 2. No literal currency symbol. `{{amount}}` and `{{total}}` arrive already
 *    formatted for the org's currency and the recipient's locale
 *    (formatBotMoney), so a '₪' here would double up.
 *
 * Kept byte-identical in supabase/functions/_shared/templates.ts.
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
 * Canonical form of a template body: LF line endings, no surrounding blank space.
 *
 * A textarea posted through a <form> arrives with CRLF — the HTML form-submission
 * algorithm normalises newlines that way — while the same textarea read from
 * JavaScript hands back LF. Storing whatever arrived meant the saved body and the
 * body in the editor differed by an invisible CR, so the card believed it had
 * unsaved edits forever and kept the submit-to-Meta button disabled until a full
 * page reload re-seeded the editor from the stored copy.
 *
 * Everything that writes, compares or submits a body goes through this, so the
 * three can never disagree — and Meta never receives a stray CR in a body.
 */
export function normalizeTemplateBody(body: string): string {
  return body.replace(/\r\n?/g, '\n').trim()
}

/**
 * The message body for the given org, type and language, WITHOUT substitution.
 *
 * Callers that lift a URL out of the body into a CTA button need the
 * unsubstituted form: `stripStandaloneVarLine` matches on the `{{placeholder}}`,
 * which no longer exists once the URL has been substituted in.
 *
 * Fallback chain, most specific first:
 *   1. Custom row in the requested locale
 *   2. DEFAULT_TEMPLATES[locale][type]
 *   3. DEFAULT_TEMPLATES.he[type]
 *
 * Exact language only. An org that customised its Hebrew copy but not its
 * English copy must still get the English default — borrowing the Hebrew custom
 * row here is how an English parent ends up with a Hebrew wrapper around English
 * homework.
 *
 * Template resolution failure must never block message sending — on any DB
 * error this catches, logs, and returns the system default.
 */
export async function loadRawTemplate(
  orgId: string,
  type: MessageTemplateType,
  locale: AppLocale = 'he'
): Promise<string> {
  const fallback = DEFAULT_TEMPLATES[locale]?.[type] ?? DEFAULT_TEMPLATES.he[type]

  try {
    const db = createServiceRoleClient()
    const { data } = await db
      .from('message_templates')
      .select('body_template')
      .eq('organization_id', orgId)
      .eq('type', type)
      .eq('locale', locale)
      .maybeSingle()

    if (data?.body_template) return data.body_template
  } catch (err) {
    console.error('[templates] DB error — falling back to default', { orgId, type, locale, err })
  }

  return fallback
}

/**
 * Resolves the message body for the given org, template type and language, then
 * substitutes {{variables}}.
 *
 * A variable this type *declares* in TEMPLATE_VARIABLES but the caller did not
 * supply resolves to an empty string — an optional variable like
 * `{{charge_lines}}` must not reach a parent as literal braces. A variable that
 * is not declared at all is left verbatim, which is the documented fail-safe for
 * a typo'd placeholder: it shows up in the editor's preview rather than
 * silently vanishing.
 *
 * A thin wrapper over `loadRawTemplate` so the two can never disagree about
 * which body an org actually has.
 */
export async function resolveTemplate(
  orgId: string,
  type: MessageTemplateType,
  vars: Record<string, string>,
  locale: AppLocale = 'he'
): Promise<string> {
  const templateStr = await loadRawTemplate(orgId, type, locale)
  return substituteVars(templateStr, withDeclaredDefaults(type, vars))
}

/**
 * `vars` plus an empty string for every variable this type declares and the
 * caller omitted. Exported for the callers that substitute themselves after
 * stripping a URL line.
 */
export function withDeclaredDefaults(
  type: MessageTemplateType,
  vars: Record<string, string>
): Record<string, string> {
  const filled: Record<string, string> = {}
  for (const name of TEMPLATE_VARIABLES[type] ?? []) filled[name] = ''
  return { ...filled, ...vars }
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
  booking_next_week_link: ['booking_url'],
  booking_confirmation: ['teacher_name', 'date', 'time'],
  lesson_reminder: ['teacher_name', 'date', 'time'],
  payment_reminder: ['amount', 'payment_link'],
  // charge_lines is advertised (unlike balance_reply's) because it is new: an
  // org that already customised this body must be able to add the itemisation
  // back, or it vanishes for them with no way to notice.
  payment_request: ['parent_name', 'amount', 'description', 'charge_lines', 'payment_link'],
  cancellation_confirmation: ['student_name', 'teacher_name', 'date', 'time', 'charge_line'],
  cancellation_admin_alert: ['student_name', 'teacher_name', 'date', 'time', 'charge_line', 'parent_phone'],
  receipt_notification: ['amount', 'receipt_url'],
  // balance_line is non-empty only after a partial payment; receipt_line only
  // when a tax document was issued for the payment. Both are botString fragments.
  payment_received: ['parent_name', 'amount', 'balance_line', 'receipt_line'],
  homework_assignment: ['title', 'body', 'due_line'],
  homework_reminder: ['title', 'due_date_suffix'],
  homework_graded: ['title', 'score', 'feedback_line'],
  // charge_lines is still substituted for orgs that customised the pre-Sprint-28
  // body, but it is deliberately not advertised — the portal holds the breakdown.
  balance_reply: ['total', 'portal_url', 'payment_line'],
  payment_history_reply: ['total', 'charge_lines'],
  schedule_reply: ['lesson_lines'],
  portal_link_reply: ['portal_url'],
  ai_satisfaction_prompt: [],
  unknown_intent_fallback: [],
  lesson_cancelled_by_teacher: ['teacher_name', 'date_range'],
  lesson_rescheduled: ['student_name', 'teacher_name', 'old_date', 'old_time', 'date', 'time'],
  day_off_decision: ['date_range', 'decision'],
  welcome_notice: ['org_name'],
}

/**
 * Display labels for each template type, in the language of the person using the
 * dashboard — not the language of the template being edited. Both sets are needed:
 * the settings page is what Meta's App Review reviewers see, in English, and a
 * Hebrew-only label map put Hebrew type names on every card for them.
 */
export const TEMPLATE_LABELS: Record<AppLocale, Record<MessageTemplateType, string>> = {
  he: {
    booking_link: 'קישור הזמנת שיעור',
    booking_next_week_link: 'קישור להזמנת שיעור לשבוע הבא',
    booking_confirmation: 'אישור הזמנת שיעור',
    lesson_reminder: 'תזכורת שיעור',
    payment_reminder: 'תזכורת תשלום',
    payment_request: 'בקשת תשלום',
    cancellation_confirmation: 'אישור ביטול שיעור (להורה)',
    cancellation_admin_alert: 'התראת ביטול (למנהל)',
    receipt_notification: 'קבלה לאחר תשלום',
    payment_received: 'אישור קבלת תשלום (להורה)',
    homework_assignment: 'שיעורי בית חדשים',
    homework_reminder: 'תזכורת שיעורי בית',
    homework_graded: 'ציון על שיעורי בית',
    balance_reply: 'תשובה לשאלת יתרה',
    payment_history_reply: 'תשובה לשאלת היסטוריית תשלומים',
    schedule_reply: 'תשובה לשאלת לוח זמנים',
    portal_link_reply: 'קישור לפורטל האישי',
    ai_satisfaction_prompt: 'בקשת משוב על תשובת AI',
    unknown_intent_fallback: 'הודעת ברירת מחדל (כוונה לא מזוהה)',
    lesson_cancelled_by_teacher: 'ביטול שיעורים בעקבות חופשת מורה (להורה)',
    lesson_rescheduled: 'עדכון מועד שיעור (להורה/תלמיד)',
    day_off_decision: 'החלטה על בקשת חופש (למורה)',
    welcome_notice: 'הודעת פתיחה (נשלחת פעם אחת לפני ההודעה הראשונה להורה)',
  },
  en: {
    booking_link: 'Booking link',
    booking_next_week_link: 'Next-week booking link',
    booking_confirmation: 'Booking confirmation',
    lesson_reminder: 'Lesson reminder',
    payment_reminder: 'Payment reminder',
    payment_request: 'Payment request',
    cancellation_confirmation: 'Cancellation confirmation (to parent)',
    cancellation_admin_alert: 'Cancellation alert (to admin)',
    receipt_notification: 'Receipt after payment',
    payment_received: 'Payment received confirmation (to parent)',
    homework_assignment: 'New homework',
    homework_reminder: 'Homework reminder',
    homework_graded: 'Homework graded',
    balance_reply: 'Reply to a balance question',
    payment_history_reply: 'Reply to a payment-history question',
    schedule_reply: 'Reply to a schedule question',
    portal_link_reply: 'Personal area link',
    ai_satisfaction_prompt: 'Feedback prompt after an AI reply',
    unknown_intent_fallback: 'Default reply (intent not recognised)',
    lesson_cancelled_by_teacher: 'Lessons cancelled for teacher time off (to parent)',
    lesson_rescheduled: 'Lesson time update',
    day_off_decision: 'Time-off request decision (to teacher)',
    welcome_notice: 'Welcome notice (sent once, before the first message to a parent)',
  },
}

/**
 * Example variable values for the settings preview — per language.
 *
 * Not cosmetic, and not only the preview: the same table feeds the "send test"
 * action (which really WhatsApps the owner) and the `example` rows submitted to
 * Meta for approval. A single shared table meant an English org previewed
 * English copy around Hebrew names and submitted Hebrew samples to Meta.
 *
 * Money samples are pre-formatted, matching what formatBotMoney hands the real
 * send now that the bodies carry no currency symbol of their own.
 */
export const TEMPLATE_PREVIEW_VARS: Record<
  AppLocale,
  Record<MessageTemplateType, Record<string, string>>
> = {
  he: {
    booking_link: { booking_url: 'https://www.getlessio.com/book/example-token' },
    booking_next_week_link: { booking_url: 'https://www.getlessio.com/book/example-token?week=2026-09-06' },
    booking_confirmation: { teacher_name: 'אהרון כהן', date: 'יום שני, 21.4', time: '17:00' },
    lesson_reminder: { teacher_name: 'אהרון כהן', date: 'יום שני, 21.4', time: '17:00' },
    payment_reminder: { amount: '₪250.00', payment_link: 'https://pay.example.com/abc' },
    payment_request: { parent_name: 'מיכל', amount: '₪250.00', description: 'שיעור מתמטיקה', charge_lines: '\n1. שיעור של דנה, 21 באפריל: ₪250.00', payment_link: 'https://pay.example.com/abc' },
    cancellation_confirmation: { student_name: 'דנה', teacher_name: 'אהרון כהן', date: 'יום שני, 21.4', time: '17:00', charge_line: '\nחיוב ביטול מלא: ₪250.00' },
    cancellation_admin_alert: { student_name: 'דנה', teacher_name: 'אהרון כהן', date: 'יום שני, 21.4', time: '17:00', charge_line: '\nחיוב: ₪250.00 (חיוב מלא)', parent_phone: '0501234567' },
    receipt_notification: { amount: '₪250.00', receipt_url: 'https://hashboniot.co.il/receipt/123' },
    payment_received: { parent_name: 'מיכל', amount: '₪250.00', balance_line: '\nיתרה לתשלום: ₪150.00', receipt_line: '\nהקבלה זמינה כאן.\nhttps://hashboniot.co.il/receipt/123' },
    homework_assignment: { title: 'עמ׳ 45–47', body: 'תרגילים 1–10', due_line: '\nלהגשה עד: יום חמישי' },
    homework_reminder: { title: 'עמ׳ 45–47', due_date_suffix: ' (21.4)' },
    homework_graded: { title: 'עמ׳ 45–47', score: '92', feedback_line: 'עבודה מצוינת!' },
    balance_reply: { total: '₪500.00', portal_url: 'https://www.getlessio.com/portal/org-id/payments', payment_line: 'להסדרת התשלום אפשר לשלם כאן:\nhttps://pay.example.com/1' },
    payment_history_reply: { total: '₪500.00', charge_lines: '\n21/04/2026: ₪250.00 ✅\n14/04/2026: ₪250.00 ✅' },
    schedule_reply: { lesson_lines: '1. יום שני, 21.4 בשעה 17:00 עם אהרון כהן\n2. יום רביעי, 23.4 בשעה 15:00 עם אהרון כהן' },
    portal_link_reply: { portal_url: 'https://www.getlessio.com/portal/org-id' },
    ai_satisfaction_prompt: {},
    unknown_intent_fallback: {},
    lesson_cancelled_by_teacher: { teacher_name: 'אהרון כהן', date_range: '20/08–22/08' },
    lesson_rescheduled: { student_name: 'דנה', teacher_name: 'אהרון כהן', old_date: 'יום שני, 21.4', old_time: '17:00', date: 'יום שלישי, 22.4', time: '17:30' },
    day_off_decision: { date_range: '20/08–22/08', decision: 'אושרה ✅' },
    welcome_notice: { org_name: 'מרכז הלמידה של אהרון' },
  },
  en: {
    booking_link: { booking_url: 'https://www.getlessio.com/book/example-token' },
    booking_next_week_link: { booking_url: 'https://www.getlessio.com/book/example-token?week=2026-09-06' },
    booking_confirmation: { teacher_name: 'Aaron Cohen', date: 'Monday, 21 Apr', time: '17:00' },
    lesson_reminder: { teacher_name: 'Aaron Cohen', date: 'Monday, 21 Apr', time: '17:00' },
    payment_reminder: { amount: '₪250.00', payment_link: 'https://pay.example.com/abc' },
    payment_request: { parent_name: 'Michelle', amount: '₪250.00', description: 'a maths lesson', charge_lines: '\n1. Lesson for Dana, 21 April: ₪250.00', payment_link: 'https://pay.example.com/abc' },
    cancellation_confirmation: { student_name: 'Dana', teacher_name: 'Aaron Cohen', date: 'Monday, 21 Apr', time: '17:00', charge_line: '\nFull cancellation charge: ₪250.00' },
    cancellation_admin_alert: { student_name: 'Dana', teacher_name: 'Aaron Cohen', date: 'Monday, 21 Apr', time: '17:00', charge_line: '\nCharge: ₪250.00 (full)', parent_phone: '0501234567' },
    receipt_notification: { amount: '₪250.00', receipt_url: 'https://hashboniot.co.il/receipt/123' },
    payment_received: { parent_name: 'Michelle', amount: '₪250.00', balance_line: '\nRemaining balance: ₪150.00', receipt_line: '\nYour receipt is available here.\nhttps://hashboniot.co.il/receipt/123' },
    homework_assignment: { title: 'pp. 45–47', body: 'Exercises 1–10', due_line: '\nDue by: Thursday' },
    homework_reminder: { title: 'pp. 45–47', due_date_suffix: ' (21 Apr)' },
    homework_graded: { title: 'pp. 45–47', score: '92', feedback_line: 'Excellent work!' },
    balance_reply: { total: '₪500.00', portal_url: 'https://www.getlessio.com/portal/org-id/payments', payment_line: 'You can settle it here:\nhttps://pay.example.com/1' },
    payment_history_reply: { total: '₪500.00', charge_lines: '\n21/04/2026: ₪250.00 ✅\n14/04/2026: ₪250.00 ✅' },
    schedule_reply: { lesson_lines: '1. Monday, 21 Apr at 17:00 with Aaron Cohen\n2. Wednesday, 23 Apr at 15:00 with Aaron Cohen' },
    portal_link_reply: { portal_url: 'https://www.getlessio.com/portal/org-id' },
    ai_satisfaction_prompt: {},
    unknown_intent_fallback: {},
    lesson_cancelled_by_teacher: { teacher_name: 'Aaron Cohen', date_range: '20/08–22/08' },
    lesson_rescheduled: { student_name: 'Dana', teacher_name: 'Aaron Cohen', old_date: 'Monday, 21 Apr', old_time: '17:00', date: 'Tuesday, 22 Apr', time: '17:30' },
    day_off_decision: { date_range: '20/08–22/08', decision: 'approved ✅' },
    welcome_notice: { org_name: "Aaron's Learning Centre" },
  },
}
