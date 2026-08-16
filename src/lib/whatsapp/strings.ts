/**
 * Bilingual bot strings that are NOT org-customisable templates.
 *
 * Two kinds live here:
 *   1. Fixed replies (unknown sender, invalid selection, …) that never went
 *      through resolveTemplate.
 *   2. Fragments spliced into template variables (charge_lines, lesson_lines,
 *      due_line, …). These are the subtle ones — without them an otherwise
 *      fully translated English body still leaks Hebrew.
 *
 * SYNC: mirrored for Deno Edge Functions in
 * supabase/functions/_shared/botStrings.ts — update both files together.
 */

import type { AppLocale } from '@/lib/i18n/locale'

export type BotStringKey =
  // Fixed replies
  | 'unknown_parent'
  | 'no_eligible_lessons'
  | 'invalid_selection'
  | 'lesson_no_longer_cancellable'
  | 'cancellation_list_header'
  | 'cancellation_list_footer'
  | 'booking_no_student'
  | 'booking_multiple_students'
  | 'no_open_homework'
  | 'homework_marked_done'
  | 'homework_done_teacher_alert'
  | 'ai_human_redirect'
  | 'otp_fallback'
  // Fragments injected into template variables
  | 'no_upcoming_lessons'
  | 'no_previous_payments'
  | 'pay_here'
  | 'paid_marker'
  | 'due_by'
  | 'no_due_date'
  | 'charge_full'
  | 'charge_partial'
  | 'charge_line_label'
  | 'charge_none'
  // CTA button labels (Meta caps display_text at 20 chars — keep them short)
  | 'cta_book_lesson'
  | 'cta_open_portal'
  // Interactive menu. Row titles are capped at 24 chars and the list button at
  // 20 by Meta, so these are deliberately terse.
  | 'menu_greeting'
  | 'menu_button'
  | 'menu_section'
  | 'menu_book'
  | 'menu_book_desc'
  | 'menu_cancel'
  | 'menu_cancel_desc'
  | 'menu_balance'
  | 'menu_balance_desc'
  | 'menu_schedule'
  | 'menu_schedule_desc'
  | 'menu_portal'
  | 'menu_portal_desc'
  | 'child_picker_body'
  | 'child_picker_button'
  | 'child_picker_section'
  | 'child_not_found'
  // Generic fallback nouns
  | 'the_teacher'
  | 'the_student'

const STRINGS: Record<AppLocale, Record<BotStringKey, string>> = {
  he: {
    unknown_parent:
      'היי 👋 המספר הזה עדיין לא רשום אצלנו במערכת.\nכדי להצטרף, אפשר לפנות ישירות לצוות ונשמח לעזור!',
    no_eligible_lessons:
      'לא מצאתי שיעורים שאפשר לבטל בשבוע הקרוב.\nאם משהו לא מסתדר, הצוות כאן בשבילכם 😊',
    invalid_selection: 'לא הצלחתי לזהות את הבחירה 🙂 הנה הרשימה שוב:',
    lesson_no_longer_cancellable: 'השיעור שנבחר כבר לא זמין לביטול. הנה הרשימה המעודכנת:',
    cancellation_list_header: 'איזה שיעור לבטל? הנה השיעורים הקרובים:',
    cancellation_list_footer: 'אפשר לענות במספר השיעור (הרשימה בתוקף ל-10 דקות).',
    booking_no_student:
      'עדיין אין תלמיד מקושר לחשבון, ולכן אי אפשר ליצור קישור לקביעת שיעור.\nאפשר לפנות לצוות ונסדר את זה 😊',
    booking_multiple_students:
      'לחשבון מקושרים כמה תלמידים, ולכן אי אפשר לקבוע שיעור אוטומטית מכאן.\nאפשר לפנות לצוות ונשמח לעזור 😊',
    no_open_homework: 'לא מצאתי שיעורי בית פתוחים לסימון 🙂',
    homework_marked_done: 'מעולה! שיעורי הבית של {{student_name}} סומנו כהושלמו 🎉',
    homework_done_teacher_alert:
      '✅ עדכון: שיעורי הבית "{{title}}" של {{student_name}} סומנו כהושלמו.',
    ai_human_redirect: 'לא הצלחתי לענות על השאלה הזו 🙂 הצוות שלנו ישמח לעזור — אפשר לפנות ישירות.',
    otp_fallback: 'קוד הכניסה שלך ל-Lessio: *{{otp}}*\nהקוד בתוקף ל-10 דקות.',

    no_upcoming_lessons: 'אין שיעורים מתוכננים בקרוב 🙂',
    no_previous_payments: 'עדיין לא נרשמו תשלומים.',
    pay_here: 'לתשלום',
    paid_marker: '✅',
    due_by: 'להגשה עד',
    no_due_date: 'ללא תאריך הגשה',
    charge_full: 'חיוב ביטול מלא',
    charge_partial: 'חיוב ביטול חלקי',
    charge_line_label: 'חיוב',
    charge_none: 'ללא חיוב ביטול',

    cta_book_lesson: 'לקביעת שיעור',
    cta_open_portal: 'לאזור האישי',

    menu_greeting: 'היי {{first_name}} 👋\nאיך אפשר לעזור?',
    menu_button: 'בחירת פעולה',
    menu_section: 'מה תרצו לעשות?',
    menu_book: 'קביעת שיעור',
    menu_book_desc: 'בחירת מועד פנוי ליומן',
    menu_cancel: 'ביטול שיעור',
    menu_cancel_desc: 'ביטול שיעור מהשבוע הקרוב',
    menu_balance: 'יתרה ותשלום',
    menu_balance_desc: 'בדיקת חוב פתוח וקישור לתשלום',
    menu_schedule: 'השיעורים הקרובים',
    menu_schedule_desc: 'מתי השיעורים הבאים',
    menu_portal: 'האזור האישי',
    menu_portal_desc: 'כניסה לפורטל ההורים',
    child_picker_body: 'עבור איזה תלמיד?',
    child_picker_button: 'בחירת תלמיד',
    child_picker_section: 'התלמידים שלי',
    child_not_found: 'לא הצלחתי לזהות את התלמיד שנבחר. אפשר לנסות שוב מהתפריט 🙂',

    the_teacher: 'המורה',
    the_student: 'התלמיד',
  },
  en: {
    unknown_parent:
      'Hi 👋 this number is not registered with us yet.\nTo get set up, just reach out to the team and we will be happy to help!',
    no_eligible_lessons:
      'I could not find any lessons to cancel in the coming week.\nIf something looks off, the team is here for you 😊',
    invalid_selection: 'I did not catch that choice 🙂 Here is the list again:',
    lesson_no_longer_cancellable:
      'That lesson is no longer available to cancel. Here is the updated list:',
    cancellation_list_header: 'Which lesson would you like to cancel? Here are the upcoming ones:',
    cancellation_list_footer: 'Just reply with the lesson number (this list is valid for 10 minutes).',
    booking_no_student:
      'There is no student linked to this account yet, so I cannot create a booking link.\nReach out to the team and we will sort it out 😊',
    booking_multiple_students:
      'This account has several students linked, so I cannot book automatically from here.\nReach out to the team and we will be happy to help 😊',
    no_open_homework: 'I could not find any open homework to mark 🙂',
    homework_marked_done: "Great! {{student_name}}'s homework is marked as done 🎉",
    homework_done_teacher_alert:
      '✅ Update: {{student_name}} marked the homework "{{title}}" as done.',
    ai_human_redirect:
      'I could not answer that one 🙂 Our team would be happy to help — feel free to reach out.',
    otp_fallback: 'Your Lessio login code: *{{otp}}*\nThe code is valid for 10 minutes.',

    no_upcoming_lessons: 'No lessons scheduled right now 🙂',
    no_previous_payments: 'No payments recorded yet.',
    pay_here: 'pay here',
    paid_marker: '✅',
    due_by: 'Due by',
    no_due_date: 'No due date',
    charge_full: 'Full cancellation charge',
    charge_partial: 'Partial cancellation charge',
    charge_line_label: 'Charge',
    charge_none: 'No cancellation charge',

    cta_book_lesson: 'Book a lesson',
    cta_open_portal: 'My personal area',

    menu_greeting: 'Hi {{first_name}} 👋\nHow can I help?',
    menu_button: 'Choose an action',
    menu_section: 'What would you like?',
    menu_book: 'Book a lesson',
    menu_book_desc: 'Pick an open slot in the calendar',
    menu_cancel: 'Cancel a lesson',
    menu_cancel_desc: 'Cancel a lesson in the coming week',
    menu_balance: 'Balance & payment',
    menu_balance_desc: 'Check what is open and pay',
    menu_schedule: 'Upcoming lessons',
    menu_schedule_desc: 'See when the next lessons are',
    menu_portal: 'Personal area',
    menu_portal_desc: 'Open the parent portal',
    child_picker_body: 'Which student is this for?',
    child_picker_button: 'Choose student',
    child_picker_section: 'My students',
    child_not_found: 'I could not identify that student. Try again from the menu 🙂',

    the_teacher: 'the teacher',
    the_student: 'the student',
  },
}

/**
 * Returns a bot string in the given language, substituting {{vars}}.
 * Falls back to Hebrew if the locale is unknown.
 */
export function botString(
  key: BotStringKey,
  locale: AppLocale = 'he',
  vars: Record<string, string> = {}
): string {
  const template = STRINGS[locale]?.[key] ?? STRINGS.he[key]
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match
  )
}
