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
  | 'balance_none'
  // Fragments injected into template variables
  | 'balance_pay_link'
  | 'balance_pay_portal'
  | 'balance_pay_contact'
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
  | 'menu_greeting_noname'
  | 'dear_parents'
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
  // Role-specific menu rows (student / teacher / staff)
  | 'menu_homework'
  | 'menu_homework_desc'
  | 'menu_my_schedule'
  | 'menu_my_schedule_desc'
  | 'menu_my_students'
  | 'menu_my_students_desc'
  | 'menu_today_summary'
  | 'menu_today_summary_desc'
  | 'menu_switch_role'
  | 'menu_switch_role_desc'
  // Student replies
  | 'student_homework_list'
  | 'student_no_homework'
  | 'student_homework_marked'
  | 'homework_done_student_alert'
  // Teacher replies
  | 'teacher_schedule_body'
  | 'teacher_no_lessons'
  | 'teacher_students_body'
  | 'teacher_no_students'
  // Staff replies
  | 'staff_summary_body'
  // Cross-role
  | 'action_not_for_role'
  | 'role_switch_body'
  | 'role_switched'
  | 'role_label_parent'
  | 'role_label_student'
  | 'role_label_teacher'
  | 'role_label_staff'
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
    balance_none: 'אין לך יתרה פתוחה לתשלום 🎉',

    balance_pay_link: 'להסדרת התשלום אפשר לשלם כאן:\n{{payment_link}}',
    balance_pay_portal:
      'להסדרת התשלום אפשר לשלם דרך האזור האישי — לכל חיוב יש שם קישור תשלום משלו.',
    balance_pay_contact: 'להסדרת התשלום אפשר לפנות למורה — פשוט להשיב להודעה הזו 🙂',
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
    menu_greeting_noname: 'היי 👋\nאיך אפשר לעזור?',
    dear_parents: 'הורים יקרים',
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

    menu_homework: 'שיעורי הבית שלי',
    menu_homework_desc: 'מה פתוח וסימון כהושלם',
    menu_my_schedule: 'הלוז שלי',
    menu_my_schedule_desc: 'השיעורים שלי היום ומחר',
    menu_my_students: 'התלמידים שלי',
    menu_my_students_desc: 'רשימה ומצב שיעורי בית',
    menu_today_summary: 'סיכום היום',
    menu_today_summary_desc: 'שיעורים, ביטולים ויתרה פתוחה',
    menu_switch_role: 'החלפת תפקיד',
    menu_switch_role_desc: 'המספר הזה משויך ליותר מתפקיד אחד',

    student_homework_list: 'שיעורי הבית הפתוחים שלך:{{homework_lines}}\n\nאפשר לכתוב "סיימתי" כדי לסמן שהושלמו.',
    student_no_homework: 'אין לך שיעורי בית פתוחים כרגע 🎉',
    student_homework_marked: 'כל הכבוד! "{{title}}" סומן כהושלם 🎉',
    homework_done_student_alert: '✅ עדכון: {{student_name}} סימן שהשיעורי בית "{{title}}" הושלמו.',

    teacher_schedule_body: 'הלוז שלך:{{lesson_lines}}',
    teacher_no_lessons: 'אין לך שיעורים מתוכננים היום או מחר 🙂',
    teacher_students_body: 'התלמידים שלך:{{student_lines}}',
    teacher_no_students: 'לא מצאתי תלמידים משויכים אליך 🙂',

    staff_summary_body:
      'סיכום להיום:\n• שיעורים: {{lessons_today}}\n• ביטולים: {{cancellations_today}}\n• יתרה פתוחה: ₪{{open_balance}}',

    action_not_for_role: 'הפעולה הזו לא זמינה מהתפריט שלך 🙂 הנה מה שאפשר לעשות:',
    role_switch_body: 'באיזה תפקיד להמשיך?',
    role_switched: 'מעולה, ממשיכים בתפקיד {{role_label}}. הנה התפריט:',
    role_label_parent: 'הורה',
    role_label_student: 'תלמיד',
    role_label_teacher: 'מורה',
    role_label_staff: 'צוות',

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
    balance_none: 'You have no outstanding balance 🎉',

    balance_pay_link: 'To settle it, you can pay here:\n{{payment_link}}',
    balance_pay_portal:
      'To settle it, pay from your personal area — every charge has its own payment link there.',
    balance_pay_contact:
      'To settle it, just reply to this message and your teacher will take it from there 🙂',
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

    // Names are stored in Hebrew, so an English greeting deliberately omits
    // them rather than reading "Hi יעל 👋". Transliterating is worse: Hebrew
    // has no vowels, so "יעל" comes out "Y'l", not "Yael".
    menu_greeting: 'Hi 👋\nHow can I help?',
    menu_greeting_noname: 'Hi 👋\nHow can I help?',
    dear_parents: 'there',
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

    menu_homework: 'My homework',
    menu_homework_desc: 'What is open, and mark it done',
    menu_my_schedule: 'My schedule',
    menu_my_schedule_desc: 'My lessons today and tomorrow',
    menu_my_students: 'My students',
    menu_my_students_desc: 'List and homework status',
    menu_today_summary: "Today's summary",
    menu_today_summary_desc: 'Lessons, cancellations, open balance',
    menu_switch_role: 'Switch role',
    menu_switch_role_desc: 'This number has more than one role',

    student_homework_list:
      'Your open homework:{{homework_lines}}\n\nReply "done" to mark it as completed.',
    student_no_homework: 'You have no open homework right now 🎉',
    student_homework_marked: 'Nice work! "{{title}}" is marked as done 🎉',
    homework_done_student_alert: '✅ Update: {{student_name}} marked the homework "{{title}}" as done.',

    teacher_schedule_body: 'Your schedule:{{lesson_lines}}',
    teacher_no_lessons: 'You have no lessons scheduled today or tomorrow 🙂',
    teacher_students_body: 'Your students:{{student_lines}}',
    teacher_no_students: 'I could not find any students assigned to you 🙂',

    staff_summary_body:
      "Today's summary:\n• Lessons: {{lessons_today}}\n• Cancellations: {{cancellations_today}}\n• Open balance: ₪{{open_balance}}",

    action_not_for_role: 'That action is not available from your menu 🙂 Here is what you can do:',
    role_switch_body: 'Which role would you like to continue as?',
    role_switched: 'Great, continuing as {{role_label}}. Here is your menu:',
    role_label_parent: 'parent',
    role_label_student: 'student',
    role_label_teacher: 'teacher',
    role_label_staff: 'staff',

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
