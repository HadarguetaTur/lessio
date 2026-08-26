/**
 * Bilingual bot strings for Edge Functions — fragments spliced into template
 * variables (due_line, teacher name fallbacks, …).
 *
 * SYNC: mirrors the subset of src/lib/whatsapp/strings.ts that Edge Functions
 * actually use — update both files together.
 */

import type { AppLocale } from './templates.ts'

export type BotStringKey =
  | 'due_by'
  | 'no_due_date'
  | 'the_teacher'
  | 'the_student'
  | 'dear_parents'
  | 'tomorrow'
  | 'soon'
  | 'homework_email_subject'
  | 'homework_email_body'
  | 'lesson_email_subject'
  | 'lesson_email_body'
  | 'payment_email_subject'
  | 'payment_email_body'
  | 'payment_email_link'
  | 'renewal_plan_label'
  | 'renewal_your_plan'
  | 'renewal_message'
  // Button labels on proactive messages. These MUST read the same as the
  // labels registered on the v3 Meta templates: inside the 24h window the
  // interactive message uses these, outside it Meta renders its own copy, and
  // the same reminder must not offer differently-worded buttons.
  | 'btn_confirm_attendance'
  | 'btn_need_to_cancel'
  | 'btn_homework_done'
  | 'cta_pay_now'

const STRINGS: Record<AppLocale, Record<BotStringKey, string>> = {
  he: {
    due_by: 'להגשה עד',
    no_due_date: 'ללא תאריך הגשה',
    the_teacher: 'המורה',
    the_student: 'התלמיד',
    dear_parents: 'הורים יקרים',
    tomorrow: 'מחר',
    soon: 'בקרוב',
    homework_email_subject: 'תזכורת שיעורי בית — {title}',
    homework_email_body:
      '<p>תזכורת: שיעורי בית "{title}" צריכים להיות מוגשים עד {due}.</p>',
    lesson_email_subject: 'תזכורת שיעור — {date} בשעה {time}',
    lesson_email_body: '<p>תזכורת: שיעור עם {teacher} ב{date} בשעה {time}.</p>',
    payment_email_subject: 'תזכורת תשלום — ₪{amount}',
    payment_email_body: '<p>תזכורת: יש לך חיוב פתוח בסך ₪{amount}.</p>',
    payment_email_link: 'לחצו כאן לתשלום',
    renewal_plan_label: 'מנוי {plan}',
    renewal_your_plan: 'המנוי שלך',
    renewal_message:
      '🔔 תזכורת מ-Lessio\n\n{plan} יתחדש אוטומטית ב-{date}.\n\nלניהול המנוי: https://www.getlessio.com/subscriptions',
    btn_confirm_attendance: 'מאשר/ת הגעה',
    btn_need_to_cancel: 'צריך לבטל',
    btn_homework_done: 'סיימתי ✅',
    cta_pay_now: 'לתשלום מאובטח',
  },
  en: {
    due_by: 'Due by',
    no_due_date: 'No due date',
    the_teacher: 'the teacher',
    the_student: 'the student',
    dear_parents: 'Dear parents',
    tomorrow: 'tomorrow',
    soon: 'soon',
    homework_email_subject: 'Homework reminder — {title}',
    homework_email_body: '<p>Reminder: homework "{title}" is due by {due}.</p>',
    lesson_email_subject: 'Lesson reminder — {date} at {time}',
    lesson_email_body: '<p>Reminder: a lesson with {teacher} on {date} at {time}.</p>',
    payment_email_subject: 'Payment reminder — ₪{amount}',
    payment_email_body: '<p>Reminder: you have an open charge of ₪{amount}.</p>',
    payment_email_link: 'Click here to pay',
    renewal_plan_label: 'the {plan} plan',
    renewal_your_plan: 'your subscription',
    renewal_message:
      '🔔 Reminder from Lessio\n\n{plan} renews automatically on {date}.\n\nManage your subscription: https://www.getlessio.com/subscriptions',
    btn_confirm_attendance: 'Confirm attendance',
    btn_need_to_cancel: 'Need to cancel',
    btn_homework_done: 'Done ✅',
    cta_pay_now: 'Pay securely',
  },
}

export function botString(
  key: BotStringKey,
  locale: AppLocale = 'he',
  vars: Record<string, string> = {}
): string {
  const raw = STRINGS[locale]?.[key] ?? STRINGS.he[key]
  return raw.replace(/\{(\w+)\}/g, (whole, name) => vars[name] ?? whole)
}
