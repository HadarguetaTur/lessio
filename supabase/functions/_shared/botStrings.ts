/**
 * Bilingual bot strings for Edge Functions — fragments spliced into template
 * variables (due_line, teacher name fallbacks, …).
 *
 * SYNC: mirrors the subset of src/lib/whatsapp/strings.ts that Edge Functions
 * actually use — update both files together.
 */

import type { AppLocale } from './templates.ts'

export type BotStringKey = 'due_by' | 'no_due_date' | 'the_teacher' | 'the_student' | 'dear_parents'

const STRINGS: Record<AppLocale, Record<BotStringKey, string>> = {
  he: {
    due_by: 'להגשה עד',
    no_due_date: 'ללא תאריך הגשה',
    the_teacher: 'המורה',
    the_student: 'התלמיד',
    dear_parents: 'הורים יקרים',
  },
  en: {
    due_by: 'Due by',
    no_due_date: 'No due date',
    the_teacher: 'the teacher',
    the_student: 'the student',
    dear_parents: 'Dear parents',
  },
}

export function botString(key: BotStringKey, locale: AppLocale = 'he'): string {
  return STRINGS[locale]?.[key] ?? STRINGS.he[key]
}
