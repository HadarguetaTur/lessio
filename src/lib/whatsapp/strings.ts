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
  | 'cancel_list_button'
  | 'cancel_list_more'
  | 'cancel_confirm_body'
  | 'cancel_confirm_yes'
  | 'cancel_confirm_no'
  | 'cancel_flow_closed'
  | 'attendance_confirmed'
  | 'attendance_lesson_gone'
  | 'homework_already_done'
  | 'booking_no_student'
  | 'booking_multiple_students'
  | 'booking_quota_reached'
  | 'booking_quota_cancel_button'
  | 'no_open_homework'
  | 'homework_marked_done'
  | 'homework_done_teacher_alert'
  | 'ai_human_redirect'
  | 'otp_fallback'
  | 'balance_none'
  | 'opt_out_confirmed'
  | 'opt_out_already'
  | 'opt_in_confirmed'
  | 'opt_in_already'
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
  | 'cta_pay_now'
  // Buttons on proactive messages. Sent from the Edge Functions, which have
  // their own copy in supabase/functions/_shared/botStrings.ts — these exist
  // here so the settings preview can show what a parent actually receives, and
  // MUST stay identical to both that file and the v3 Meta template labels.
  | 'btn_confirm_attendance'
  | 'btn_need_to_cancel'
  | 'btn_homework_done'
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
  | 'menu_day_off'
  | 'menu_day_off_desc'
  | 'menu_today_summary'
  | 'menu_today_summary_desc'
  | 'menu_pending_requests'
  | 'menu_pending_requests_desc'
  | 'menu_support'
  | 'menu_support_desc'
  | 'menu_dashboard'
  | 'menu_dashboard_desc'
  | 'menu_switch_role'
  | 'menu_switch_role_desc'
  // Student replies
  | 'student_homework_list'
  | 'student_no_homework'
  | 'student_homework_marked'
  | 'homework_done_student_alert'
  | 'student_no_parent_linked'
  | 'cancelled_by_student_note'
  // Student exam-report flow
  | 'menu_report_exam'
  | 'menu_report_exam_desc'
  | 'exam_report_ask_subject'
  | 'exam_report_ask_title'
  | 'exam_report_ask_date'
  | 'exam_report_ask_file'
  | 'exam_report_confirmed'
  | 'exam_report_file_too_large'
  | 'exam_report_invalid_date'
  | 'teacher_exam_reported_alert'
  // Teacher replies
  | 'teacher_schedule_body'
  | 'teacher_no_lessons'
  | 'teacher_students_body'
  | 'teacher_no_students'
  | 'teacher_dashboard_link'
  // Teacher day-off request flow
  | 'day_off_pick_start_body'
  | 'day_off_pick_start_button'
  | 'day_off_pick_end_body'
  | 'day_off_pick_end_button'
  | 'day_off_more_days'
  | 'day_off_more_days_desc'
  | 'day_off_single_day'
  | 'day_off_single_day_desc'
  | 'day_off_abort_row'
  | 'day_off_confirm_body'
  | 'day_off_confirm_button'
  | 'day_off_cancel_button'
  | 'day_off_submitted'
  | 'day_off_already_pending'
  | 'day_off_invalid'
  | 'day_off_aborted'
  | 'day_off_approved_teacher'
  | 'day_off_rejected_teacher'
  | 'decision_approved'
  | 'decision_rejected'
  // Staff replies
  | 'staff_summary_body'
  | 'staff_dashboard_link'
  | 'staff_day_off_alert'
  | 'staff_approve_button'
  | 'staff_reject_button'
  | 'staff_pending_list_body'
  | 'staff_pending_list_button'
  | 'staff_no_pending_requests'
  | 'staff_request_detail'
  | 'staff_request_approved'
  | 'staff_request_rejected'
  | 'staff_request_already_decided'
  | 'staff_request_stale'
  | 'staff_request_not_found'
  // Support requests raised from the staff menu
  | 'support_prompt'
  | 'support_confirm'
  | 'support_send_button'
  | 'support_cancel_button'
  | 'support_created'
  | 'support_cancelled'
  | 'support_empty_text'
  // Owner copilot (staff free text answered or acted on by the AI)
  | 'copilot_confirm_all'
  | 'copilot_confirm_parent'
  | 'copilot_no_debtors'
  | 'copilot_cancelled'
  | 'copilot_summary'
  | 'copilot_reminder_sent'
  | 'copilot_reminder_not_sent'
  | 'copilot_error'
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
  | 'the_parent'
  | 'lesson_list_line'
  | 'student_line_with_homework'
  | 'ics_lesson_summary'
  | 'ics_teacher_line'
  | 'lesson_date_format'
  | 'ai_the_school'
  | 'ai_the_customer'
  | 'ai_no_upcoming_lessons'
  | 'ai_lesson_datetime_format'
  | 'ai_lesson_history_header'
  | 'ai_lesson_history_line'
  | 'the_student'
  | 'unsupported_media'
  | 'org_suspended'

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
    cancel_list_button: 'בחירת שיעור',
    cancel_list_more: 'עוד שיעורים ⬇️',
    cancel_confirm_body: 'לבטל את השיעור של {{student_name}} ב{{date}} בשעה {{time}}?',
    cancel_confirm_yes: 'כן, לבטל',
    cancel_confirm_no: 'לא, חזרה',
    cancel_flow_closed: 'סגרתי את הבקשה — שום שיעור לא בוטל 🙂',
    attendance_confirmed: 'מעולה, רשמנו שאתם מגיעים 👍 נתראה בשיעור!',
    attendance_lesson_gone: 'השיעור הזה כבר לא מופיע ביומן. אם משהו לא ברור, הצוות כאן בשבילכם 🙂',
    homework_already_done: 'שיעורי הבית האלה כבר מסומנים כהושלמו 🎉',
    booking_no_student:
      'עדיין אין תלמיד מקושר לחשבון, ולכן אי אפשר ליצור קישור לקביעת שיעור.\nאפשר לפנות לצוות ונסדר את זה 😊',
    booking_multiple_students:
      'לחשבון מקושרים כמה תלמידים, ולכן אי אפשר לקבוע שיעור אוטומטית מכאן.\nאפשר לפנות לצוות ונשמח לעזור 😊',
    booking_quota_reached:
      'ל{{student_name}} כבר יש שיעור השבוע, ולכן אי אפשר לקבוע שיעור נוסף לשבוע הזה.\nאפשר לבטל את השיעור הקיים ולקבוע מחדש, או לקבוע לשבוע הבא דרך הקישור 👇',
    booking_quota_cancel_button: 'ביטול שיעור',
    no_open_homework: 'לא מצאתי שיעורי בית פתוחים לסימון 🙂',
    homework_marked_done: 'מעולה! שיעורי הבית של {{student_name}} סומנו כהושלמו 🎉',
    homework_done_teacher_alert:
      '✅ עדכון: שיעורי הבית "{{title}}" של {{student_name}} סומנו כהושלמו.',
    ai_human_redirect: 'לא הצלחתי לענות על השאלה הזו 🙂 הצוות שלנו ישמח לעזור — אפשר לפנות ישירות.',
    otp_fallback: 'קוד הכניסה שלך ל-Lessio: *{{otp}}*\nהקוד בתוקף ל-10 דקות.',
    balance_none: 'אין לך יתרה פתוחה לתשלום 🎉',
    opt_out_confirmed:
      'סגור, הפסקנו לשלוח 👍\nלא יישלחו אליך יותר תזכורות, בקשות תשלום או עדכונים אוטומטיים.\nאפשר תמיד לכתוב "התחל" כדי לחדש, ואם תכתבו לנו — נענה תמיד.',
    opt_out_already:
      'ההודעות האוטומטיות כבר מושבתות עבורך 👍\nכדי לחדש אותן אפשר לכתוב "התחל".',
    opt_in_confirmed: 'מעולה, חידשנו את ההודעות 🎉\nתקבלו שוב תזכורות ועדכונים על השיעורים.',
    opt_in_already: 'ההודעות כבר פעילות אצלך 🙂',

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
    // Must read the same as the URL button registered on the v3 payment
    // templates: the same request reaches a parent either way.
    cta_pay_now: 'לתשלום מאובטח',
    btn_confirm_attendance: 'מאשר/ת הגעה',
    btn_need_to_cancel: 'צריך לבטל',
    btn_homework_done: 'סיימתי',

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
    menu_my_schedule_desc: 'השיעורים שלי בשבוע הקרוב',
    menu_my_students: 'התלמידים שלי',
    menu_my_students_desc: 'רשימה ומצב שיעורי בית',
    menu_day_off: 'בקשת חופש',
    menu_day_off_desc: 'יום חופש או כמה ימים ברצף',
    menu_today_summary: 'סיכום היום',
    menu_today_summary_desc: 'שיעורים, ביטולים ויתרה פתוחה',
    menu_pending_requests: 'בקשות ממתינות',
    menu_pending_requests_desc: 'בקשות חופש שמחכות להחלטה',
    menu_support: 'תמיכה',
    menu_support_desc: 'פנייה לצוות Lessio',
    menu_dashboard: 'האזור האישי',
    menu_dashboard_desc: 'כניסה למערכת מהדפדפן',
    menu_switch_role: 'החלפת תפקיד',
    menu_switch_role_desc: 'המספר הזה משויך ליותר מתפקיד אחד',

    student_homework_list: 'שיעורי הבית הפתוחים שלך:{{homework_lines}}\n\nאפשר לכתוב "סיימתי" כדי לסמן שהושלמו.',
    student_no_homework: 'אין לך שיעורי בית פתוחים כרגע 🎉',
    student_homework_marked: 'כל הכבוד! "{{title}}" סומן כהושלם 🎉',
    homework_done_student_alert: '✅ עדכון: {{student_name}} סימן שהשיעורי בית "{{title}}" הושלמו.',
    student_no_parent_linked:
      'לא מצאתי הורה מקושר לחשבון שלך, ולכן אי אפשר לקבוע או לבטל שיעור מכאן.\nאפשר לפנות לצוות ונסדר את זה 😊',
    cancelled_by_student_note: '❗ {{student_name}} ביטל/ה את השיעור דרך וואטסאפ.',

    menu_report_exam: 'דיווח על מבחן',
    menu_report_exam_desc: 'מבחן מתקרב? ספרו לנו',
    exam_report_ask_subject: 'באיזה מקצוע המבחן? (למשל: מתמטיקה)',
    exam_report_ask_title: 'על מה המבחן? אפשר לכתוב נושא או תיאור קצר.',
    exam_report_ask_date: 'מתי המבחן? כתבו תאריך, למשל 15/09',
    exam_report_ask_file:
      'אם יש חומר למבחן (צילום או קובץ) — שלחו אותו עכשיו.\nאין קובץ? כתבו "דלג" וזהו 🙂',
    exam_report_confirmed:
      'מעולה! דיווח על מבחן {{subject}} ב-{{exam_date}} נשמר, והמורה קיבל עדכון 💪',
    exam_report_file_too_large: 'הקובץ גדול מדי (עד 10MB). אפשר לשלוח קובץ קטן יותר או לכתוב "דלג".',
    exam_report_invalid_date: 'לא הצלחתי להבין את התאריך 🙂 כתבו למשל 15/09 (יום/חודש).',
    teacher_exam_reported_alert:
      '📄 {{student_name}} דיווח/ה על מבחן ב{{subject}}: "{{title}}" בתאריך {{exam_date}}.\nהפרטים המלאים בכרטיס התלמיד במערכת.',

    teacher_schedule_body: 'הלוז שלך לשבוע הקרוב:{{lesson_lines}}',
    teacher_no_lessons: 'אין לך שיעורים מתוכננים בשבוע הקרוב 🙂',
    teacher_students_body: 'התלמידים שלך:{{student_lines}}',
    teacher_no_students: 'לא מצאתי תלמידים משויכים אליך 🙂',
    teacher_dashboard_link:
      'האזור האישי שלך:\n{{url}}\n\nהכניסה עם האימייל והסיסמה שלך למערכת.',

    day_off_pick_start_body: 'מאיזה תאריך תרצה/י חופש?',
    day_off_pick_start_button: 'בחירת תאריך',
    day_off_pick_end_body: 'עד מתי? החופש יתחיל ב-{{start_date}}.',
    day_off_pick_end_button: 'בחירת סיום',
    day_off_more_days: 'עוד תאריכים →',
    day_off_more_days_desc: 'הצגת שבוע נוסף קדימה',
    day_off_single_day: 'יום אחד בלבד',
    day_off_single_day_desc: 'רק {{start_date}}',
    day_off_abort_row: 'ביטול הבקשה',
    day_off_confirm_body:
      'לבקש חופש בתאריכים {{date_range}}?\nהבקשה תישלח לאישור ההנהלה, ורק אחרי אישור השיעורים יבוטלו.',
    day_off_confirm_button: 'שליחת הבקשה',
    day_off_cancel_button: 'ביטול',
    day_off_submitted:
      'הבקשה לתאריכים {{date_range}} נשלחה לאישור 🤞\nנעדכן אותך ברגע שתתקבל החלטה.',
    day_off_already_pending:
      'כבר יש לך בקשת חופש שממתינה להחלטה. אפשר לחכות לתשובה, או לפנות להנהלה ישירות 🙂',
    day_off_invalid: 'משהו השתבש בבחירה 🙂 אפשר להתחיל שוב מהתפריט.',
    day_off_aborted: 'הבקשה בוטלה. אם תשנה/י את דעתך, אפשר להתחיל שוב מהתפריט 🙂',
    day_off_approved_teacher:
      'בקשת החופש שלך לתאריכים {{date_range}} אושרה ✅\nבוטלו {{lessons}} שיעורים וההורים עודכנו.',
    day_off_rejected_teacher:
      'בקשת החופש שלך לתאריכים {{date_range}} לא אושרה.\nכדאי לדבר עם ההנהלה 🙂',
    decision_approved: 'אושרה',
    decision_rejected: 'נדחתה',

    staff_summary_body:
      'סיכום להיום:\n• שיעורים: {{lessons_today}}\n• ביטולים: {{cancellations_today}}\n• יתרה פתוחה: ₪{{open_balance}}',
    staff_dashboard_link: 'הכניסה למערכת:\n{{url}}\n\nעם האימייל והסיסמה שלך.',
    staff_day_off_alert:
      '🏖️ בקשת חופש חדשה\n\n{{teacher_name}} מבקש/ת חופש בתאריכים {{date_range}}.\nבטווח הזה מתוכננים {{lessons}} שיעורים — אישור יבטל אותם ויעדכן את ההורים, ללא חיוב.',
    staff_approve_button: 'אישור',
    staff_reject_button: 'דחייה',
    staff_pending_list_body: 'בקשות חופש שממתינות להחלטה:',
    staff_pending_list_button: 'בחירת בקשה',
    staff_no_pending_requests: 'אין בקשות חופש שממתינות להחלטה 🙂',
    staff_request_detail:
      '🏖️ {{teacher_name}} מבקש/ת חופש בתאריכים {{date_range}}.\nבטווח הזה מתוכננים {{lessons}} שיעורים — אישור יבטל אותם ויעדכן את ההורים, ללא חיוב.',
    staff_request_approved:
      'הבקשה אושרה ✅\nבוטלו {{lessons}} שיעורים, ונשלחו הודעות ל-{{parents}} הורים.',
    staff_request_rejected: 'הבקשה נדחתה. {{teacher_name}} קיבל/ה עדכון.',
    staff_request_already_decided: 'הבקשה הזו כבר טופלה 🙂',
    staff_request_stale:
      'התאריכים בבקשה כבר עברו, ולכן היא סומנה כנדחתה. לא בוטלו שיעורים.',
    staff_request_not_found: 'לא מצאתי את הבקשה הזו. אפשר לנסות שוב מהתפריט 🙂',

    support_prompt:
      'מה קרה? כתבי לי כאן בהודעה אחת מה ניסית לעשות ומה קרה בפועל, ואני אעביר לצוות Lessio.',
    support_confirm: 'זה מה שיישלח לצוות Lessio:\n\n"{{text}}"\n\nלשלוח?',
    support_send_button: 'שליחה',
    support_cancel_button: 'ביטול',
    support_created:
      'הפנייה נשלחה לצוות Lessio ✅\nנחזור אלייך כאן או במערכת. אפשר לעקוב באזור האישי תחת "הפניות שלי".',
    support_cancelled: 'הפנייה בוטלה ולא נשלחה 🙂',
    support_empty_text:
      'לא הצלחתי לקרוא את ההודעה. אפשר לכתוב לי במילים מה קרה?',

    copilot_confirm_all: 'לשלוח תזכורת תשלום ל-{{count}} חייבים?',
    copilot_confirm_parent: 'לשלוח תזכורת תשלום ל{{parent_name}}?',
    copilot_no_debtors: 'אין כרגע חובות פתוחים 🎉',
    copilot_cancelled: 'בוטל — לא נשלחו תזכורות 🙂',
    copilot_summary: 'סיימתי ✅ נשלחו: {{sent}} · דולגו: {{skipped}} · נכשלו: {{failed}}',
    copilot_reminder_sent: 'התזכורת נשלחה ✅',
    copilot_reminder_not_sent: 'התזכורת לא נשלחה 🙁 אפשר לנסות שוב מהדשבורד.',
    copilot_error: 'לא הצלחתי לטפל בזה כרגע 🙂 אפשר לנסות שוב או לכתוב "תפריט".',

    action_not_for_role: 'הפעולה הזו לא זמינה מהתפריט שלך 🙂 הנה מה שאפשר לעשות:',
    role_switch_body: 'באיזה תפקיד להמשיך?',
    role_switched: 'מעולה, ממשיכים בתפקיד {{role_label}}. הנה התפריט:',
    role_label_parent: 'הורה',
    role_label_student: 'תלמיד',
    role_label_teacher: 'מורה',
    role_label_staff: 'צוות',

    the_teacher: 'המורה',
    the_parent: 'ההורה',
    lesson_list_line: '{{n}}. {{date}} בשעה {{time}} עם {{teacher}}',
    student_line_with_homework: '{{name}} — {{open}} שיעורי בית פתוחים',
    ics_lesson_summary: 'שיעור — {{students}}',
    ics_teacher_line: 'מורה: {{teacher}}',
    lesson_date_format: "EEEE, d 'ב'MMMM",
    ai_the_school: 'בית הספר',
    ai_the_customer: 'הלקוח',
    ai_no_upcoming_lessons: 'אין שיעורים מתוכננים',
    ai_lesson_datetime_format: "EEEE d/M 'בשעה' HH:mm",
    ai_lesson_history_header: 'היסטוריית שיעורים ({{from}} עד {{to}}):',
    ai_lesson_history_line:
      '- {{name}}: {{completed}} שיעורים שהתקיימו, {{no_show}} אי-הגעה, {{cancelled}} בוטלו',
    the_student: 'התלמיד',
    unsupported_media:
      'קיבלתי 🙂 כאן אפשר לעזור רק בהודעות טקסט — תמונות, הקלטות וקבצים לא נקראים.\nאפשר לכתוב "תפריט" כדי לראות מה אפשר לעשות, או לפנות ישירות לצוות.',
    // Deliberately silent about billing: the parent is not a party to the
    // teacher's subscription, and "they did not pay" is not ours to disclose.
    org_suspended:
      'המענה האוטומטי אינו זמין כרגע. לתיאום, ביטול או כל שאלה — אנא פנו ישירות למורה.',
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
    cancel_list_button: 'Choose a lesson',
    cancel_list_more: 'More lessons ⬇️',
    cancel_confirm_body: "Cancel {{student_name}}'s lesson on {{date}} at {{time}}?",
    cancel_confirm_yes: 'Yes, cancel it',
    cancel_confirm_no: 'No, go back',
    cancel_flow_closed: 'All closed — no lesson was cancelled 🙂',
    attendance_confirmed: 'Great, we have you down as coming 👍 See you at the lesson!',
    attendance_lesson_gone:
      'That lesson is no longer on the calendar. If something looks off, the team is here for you 🙂',
    homework_already_done: 'That homework is already marked as done 🎉',
    booking_no_student:
      'There is no student linked to this account yet, so I cannot create a booking link.\nReach out to the team and we will sort it out 😊',
    booking_multiple_students:
      'This account has several students linked, so I cannot book automatically from here.\nReach out to the team and we will be happy to help 😊',
    booking_quota_reached:
      '{{student_name}} already has a lesson this week, so another one cannot be booked for this week.\nYou can cancel the existing lesson and book again, or book next week through the link 👇',
    booking_quota_cancel_button: 'Cancel a lesson',
    no_open_homework: 'I could not find any open homework to mark 🙂',
    homework_marked_done: "Great! {{student_name}}'s homework is marked as done 🎉",
    homework_done_teacher_alert:
      '✅ Update: {{student_name}} marked the homework "{{title}}" as done.',
    ai_human_redirect:
      'I could not answer that one 🙂 Our team would be happy to help — feel free to reach out.',
    otp_fallback: 'Your Lessio login code: *{{otp}}*\nThe code is valid for 10 minutes.',
    balance_none: 'You have no outstanding balance 🎉',
    opt_out_confirmed:
      "Done — we've stopped 👍\nYou will no longer receive reminders, payment requests or any automated updates from us.\nReply START at any time to turn them back on, and if you message us we will always reply.",
    opt_out_already:
      'Automated messages are already switched off for you 👍\nReply START to turn them back on.',
    opt_in_confirmed:
      'Great — messages are back on 🎉\nYou will receive lesson reminders and updates again.',
    opt_in_already: 'Your messages are already switched on 🙂',

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
    cta_pay_now: 'Pay securely',
    btn_confirm_attendance: 'Confirm attendance',
    btn_need_to_cancel: 'Need to cancel',
    btn_homework_done: 'Done',

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
    menu_my_schedule_desc: 'My lessons over the coming week',
    menu_my_students: 'My students',
    menu_my_students_desc: 'List and homework status',
    menu_day_off: 'Request time off',
    menu_day_off_desc: 'A day off, or a few days in a row',
    menu_today_summary: "Today's summary",
    menu_today_summary_desc: 'Lessons, cancellations, open balance',
    menu_pending_requests: 'Pending requests',
    menu_pending_requests_desc: 'Time-off requests awaiting a decision',
    menu_support: 'Support',
    menu_support_desc: 'Contact the Lessio team',
    menu_dashboard: 'My dashboard',
    menu_dashboard_desc: 'Open the system in your browser',
    menu_switch_role: 'Switch role',
    menu_switch_role_desc: 'This number has more than one role',

    student_homework_list:
      'Your open homework:{{homework_lines}}\n\nReply "done" to mark it as completed.',
    student_no_homework: 'You have no open homework right now 🎉',
    student_homework_marked: 'Nice work! "{{title}}" is marked as done 🎉',
    homework_done_student_alert: '✅ Update: {{student_name}} marked the homework "{{title}}" as done.',
    student_no_parent_linked:
      'I could not find a parent linked to your account, so I cannot book or cancel a lesson from here.\nReach out to the team and we will sort it out 😊',
    cancelled_by_student_note: '❗ {{student_name}} cancelled this lesson over WhatsApp.',

    menu_report_exam: 'Report an exam',
    menu_report_exam_desc: 'Exam coming up? Let us know',
    exam_report_ask_subject: 'Which subject is the exam in? (e.g. Math)',
    exam_report_ask_title: 'What is the exam about? A topic or short description works.',
    exam_report_ask_date: 'When is the exam? Type a date, e.g. 15/09',
    exam_report_ask_file:
      'If you have exam material (a photo or file) — send it now.\nNo file? Just type "skip" 🙂',
    exam_report_confirmed:
      'Great! Your {{subject}} exam on {{exam_date}} was recorded and the teacher has been notified 💪',
    exam_report_file_too_large: 'That file is too large (10MB max). Send a smaller one or type "skip".',
    exam_report_invalid_date: 'I could not read that date 🙂 Try something like 15/09 (day/month).',
    teacher_exam_reported_alert:
      '📄 {{student_name}} reported a {{subject}} exam: "{{title}}" on {{exam_date}}.\nFull details are on the student card in the dashboard.',

    teacher_schedule_body: 'Your schedule for the coming week:{{lesson_lines}}',
    teacher_no_lessons: 'You have no lessons scheduled in the coming week 🙂',
    teacher_students_body: 'Your students:{{student_lines}}',
    teacher_no_students: 'I could not find any students assigned to you 🙂',
    teacher_dashboard_link:
      'Your personal area:\n{{url}}\n\nSign in with your system email and password.',

    day_off_pick_start_body: 'Which day would you like off?',
    day_off_pick_start_button: 'Choose a date',
    day_off_pick_end_body: 'Until when? Your time off starts on {{start_date}}.',
    day_off_pick_end_button: 'Choose the end',
    day_off_more_days: 'More dates →',
    day_off_more_days_desc: 'Show another week ahead',
    day_off_single_day: 'Just one day',
    day_off_single_day_desc: '{{start_date}} only',
    day_off_abort_row: 'Cancel the request',
    day_off_confirm_body:
      'Request time off on {{date_range}}?\nIt goes to management for approval — lessons are only cancelled once they approve.',
    day_off_confirm_button: 'Send request',
    day_off_cancel_button: 'Cancel',
    day_off_submitted:
      'Your request for {{date_range}} has been sent for approval 🤞\nWe will let you know as soon as there is a decision.',
    day_off_already_pending:
      'You already have a time-off request awaiting a decision. Wait for the answer, or talk to management directly 🙂',
    day_off_invalid: 'Something went wrong with that choice 🙂 Start again from the menu.',
    day_off_aborted: 'Request cancelled. If you change your mind, start again from the menu 🙂',
    day_off_approved_teacher:
      'Your time-off request for {{date_range}} was approved ✅\n{{lessons}} lessons were cancelled and the parents have been told.',
    day_off_rejected_teacher:
      'Your time-off request for {{date_range}} was not approved.\nWorth having a word with management 🙂',
    decision_approved: 'approved',
    decision_rejected: 'declined',

    staff_summary_body:
      "Today's summary:\n• Lessons: {{lessons_today}}\n• Cancellations: {{cancellations_today}}\n• Open balance: ₪{{open_balance}}",
    staff_dashboard_link: 'Sign in here:\n{{url}}\n\nWith your email and password.',
    staff_day_off_alert:
      '🏖️ New time-off request\n\n{{teacher_name}} is asking for time off on {{date_range}}.\n{{lessons}} lessons are scheduled in that period — approving cancels them and tells the parents, with no charge.',
    staff_approve_button: 'Approve',
    staff_reject_button: 'Decline',
    staff_pending_list_body: 'Time-off requests awaiting a decision:',
    staff_pending_list_button: 'Choose a request',
    staff_no_pending_requests: 'No time-off requests are waiting for a decision 🙂',
    staff_request_detail:
      '🏖️ {{teacher_name}} is asking for time off on {{date_range}}.\n{{lessons}} lessons are scheduled in that period — approving cancels them and tells the parents, with no charge.',
    staff_request_approved:
      'Approved ✅\n{{lessons}} lessons cancelled, {{parents}} parents notified.',
    staff_request_rejected: 'Request declined. {{teacher_name}} has been told.',
    staff_request_already_decided: 'That request has already been handled 🙂',
    staff_request_stale:
      'The dates in that request have already passed, so it was marked as declined. No lessons were cancelled.',
    staff_request_not_found: 'I could not find that request. Try again from the menu 🙂',

    support_prompt:
      'What happened? Send me one message describing what you were trying to do and what happened instead, and I will pass it to the Lessio team.',
    support_confirm: 'This is what will be sent to the Lessio team:\n\n"{{text}}"\n\nSend it?',
    support_send_button: 'Send',
    support_cancel_button: 'Cancel',
    support_created:
      'Sent to the Lessio team ✅\nWe will reply here or in the app. You can follow it under "My requests" in your dashboard.',
    support_cancelled: 'Request cancelled — nothing was sent 🙂',
    support_empty_text: 'I could not read that message. Could you describe what happened in words?',

    copilot_confirm_all: 'Send a payment reminder to {{count}} debtors?',
    copilot_confirm_parent: 'Send a payment reminder to {{parent_name}}?',
    copilot_no_debtors: 'No open debts right now 🎉',
    copilot_cancelled: 'Cancelled — no reminders were sent 🙂',
    copilot_summary: 'Done ✅ Sent: {{sent}} · Skipped: {{skipped}} · Failed: {{failed}}',
    copilot_reminder_sent: 'Reminder sent ✅',
    copilot_reminder_not_sent: 'The reminder was not sent 🙁 You can retry from the dashboard.',
    copilot_error: 'I could not handle that right now 🙂 Try again or type "menu".',

    action_not_for_role: 'That action is not available from your menu 🙂 Here is what you can do:',
    role_switch_body: 'Which role would you like to continue as?',
    role_switched: 'Great, continuing as {{role_label}}. Here is your menu:',
    role_label_parent: 'parent',
    role_label_student: 'student',
    role_label_teacher: 'teacher',
    role_label_staff: 'staff',

    the_teacher: 'the teacher',
    the_parent: 'the parent',
    lesson_list_line: '{{n}}. {{date}} at {{time}} with {{teacher}}',
    student_line_with_homework: '{{name}} — {{open}} open homework',
    ics_lesson_summary: 'Lesson — {{students}}',
    ics_teacher_line: 'Teacher: {{teacher}}',
    lesson_date_format: 'EEEE, MMMM d',
    ai_the_school: 'the school',
    ai_the_customer: 'the customer',
    ai_no_upcoming_lessons: 'No upcoming lessons',
    ai_lesson_datetime_format: "EEEE d/M 'at' HH:mm",
    ai_lesson_history_header: 'Lesson history ({{from}} to {{to}}):',
    ai_lesson_history_line:
      '- {{name}}: {{completed}} lessons held, {{no_show}} no-shows, {{cancelled}} cancelled',
    the_student: 'the student',
    unsupported_media:
      'Got it 🙂 I can only help with text messages here — photos, voice notes and files are not read.\nType "menu" to see what I can do, or reach out to the team directly.',
    org_suspended:
      'Automated replies are not available right now. For scheduling, cancellations or any question, please contact your teacher directly.',
  },
}

/** Every key at runtime, so tests can sweep the whole table. */
export const BOT_STRING_KEYS = Object.keys(STRINGS.he) as BotStringKey[]

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
