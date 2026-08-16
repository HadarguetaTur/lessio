/**
 * Meta Approved Template registry.
 * Per /docs/sprint-23-scope.md § Story 4c.
 *
 * Template names are PLACEHOLDERS — update them after Meta approval
 * without changing code. Each entry maps a MessageTemplateType to the
 * Meta template spec needed for sendTemplateMessage().
 *
 * Language code 'he' = Hebrew, 'en' = English.
 *
 * NOTE: Only template types used in proactive outbound reminders need
 * approved templates. Reactive session messages (within 24h window)
 * always use sendTextMessage via resolveTemplate.
 */

import type { AppLocale } from '@/lib/i18n/locale'
import type { MessageTemplateType } from './templates'
import type { MetaTemplateComponent } from './index'

export type ApprovedTemplate = {
  /** Meta template name — PLACEHOLDER until approved */
  name: string
  /** BCP 47 language code */
  languageCode: string
  /**
   * Builds the template components array from resolved variables.
   * Return [] if the template has no variable parameters (static body).
   */
  buildComponents: (vars: Record<string, string>) => MetaTemplateComponent[]
}

/**
 * Meta rejects body parameters that are empty or contain newlines/tabs, and the
 * same vars map feeds the free-text templates where a leading "\n" is normal
 * (due_line, feedback_line). Normalise at this single choke point.
 */
function param(value: string | undefined, fallback: string): { type: 'text'; text: string } {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return { type: 'text', text: text || fallback }
}

/**
 * Approved template registry, keyed by language.
 * Template names follow the convention `lessio_<type>_<lang>_v2`.
 *
 * Only the `name` differs between languages — the parameter order is identical,
 * so `buildComponents` is shared via buildHeTemplates() below.
 */
const HE_TEMPLATES: Partial<Record<MessageTemplateType, ApprovedTemplate>> = {
  lesson_reminder: {
    name: 'lessio_lesson_reminder_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.teacher_name, 'המורה'),
          param(vars.date, ''),
          param(vars.time, ''),
        ],
      },
    ],
  },

  payment_reminder: {
    name: 'lessio_payment_reminder_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.parent_name, 'הורים יקרים'),
          param(vars.amount, '0'),
        ],
      },
    ],
  },

  payment_request: {
    // Callers pass the link as `payment_link` (same key as the text template).
    name: 'lessio_payment_request_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.amount, '0'),
          param(vars.payment_link, ''),
        ],
      },
    ],
  },

  homework_reminder: {
    name: 'lessio_homework_reminder_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.student_name, 'התלמיד'),
          param(vars.homework_title ?? vars.title, 'שיעורי בית'),
          param(vars.due_date, 'מחר'),
        ],
      },
    ],
  },

  homework_assignment: {
    name: 'lessio_homework_assignment_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.title, 'שיעורי בית'),
          param(vars.body, 'ראו פרטים באזור האישי'),
          param(vars.due_line, 'ללא תאריך הגשה'),
        ],
      },
    ],
  },

  homework_graded: {
    name: 'lessio_homework_graded_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.title, 'שיעורי בית'),
          param(vars.score, '0'),
          param(vars.feedback_line, 'אין משוב נוסף.'),
        ],
      },
    ],
  },
}

/**
 * English registry, derived from the Hebrew one: the parameter order is
 * identical per template, so only the Meta template name, the language code
 * and the Hebrew greeting fallback differ. Deriving keeps the two from drifting.
 */
const EN_TEMPLATES: Partial<Record<MessageTemplateType, ApprovedTemplate>> = Object.fromEntries(
  Object.entries(HE_TEMPLATES).map(([type, spec]) => [
    type,
    {
      name: spec.name.replace('_he_v2', '_en_v2'),
      languageCode: 'en',
      buildComponents: (vars: Record<string, string>) =>
        // Only the Hebrew literal fallbacks inside spec.buildComponents need
        // overriding; every other parameter is language-neutral data.
        spec.buildComponents({
          ...vars,
          parent_name: vars.parent_name || 'there',
          teacher_name: vars.teacher_name || 'your teacher',
          student_name: vars.student_name || 'the student',
          title: vars.title || 'homework',
          body: vars.body || 'See details in your personal area',
          due_line: vars.due_line || 'No due date',
          due_date: vars.due_date || 'tomorrow',
          feedback_line: vars.feedback_line || 'No additional feedback.',
        }),
    } satisfies ApprovedTemplate,
  ])
) as Partial<Record<MessageTemplateType, ApprovedTemplate>>

export const APPROVED_TEMPLATES: Record<
  AppLocale,
  Partial<Record<MessageTemplateType, ApprovedTemplate>>
> = {
  he: HE_TEMPLATES,
  en: EN_TEMPLATES,
}

/**
 * Returns the approved template spec for a message type in the given language,
 * or null if none is configured. Callers should fall back to 'he' rather than
 * to plain text — a text send outside the 24h window fails with error 131047.
 */
export function getApprovedTemplate(
  type: MessageTemplateType,
  locale: AppLocale = 'he'
): ApprovedTemplate | null {
  return APPROVED_TEMPLATES[locale]?.[type] ?? null
}
