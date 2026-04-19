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
 * Approved template registry.
 * Template names follow the convention `lessio_<type>_<lang>`.
 */
export const APPROVED_TEMPLATES: Partial<Record<MessageTemplateType, ApprovedTemplate>> = {
  lesson_reminder: {
    name: 'lessio_lesson_reminder_he',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: vars.teacher_name ?? '' },
          { type: 'text', text: vars.date ?? '' },
          { type: 'text', text: vars.time ?? '' },
        ],
      },
    ],
  },

  payment_reminder: {
    name: 'lessio_payment_reminder_he',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: vars.parent_name ?? '' },
          { type: 'text', text: vars.amount ?? '' },
        ],
      },
    ],
  },

  payment_request: {
    name: 'lessio_payment_request_he',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: vars.amount ?? '' },
          { type: 'text', text: vars.payment_url ?? '' },
        ],
      },
    ],
  },

  homework_reminder: {
    name: 'lessio_homework_reminder_he',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: vars.student_name ?? '' },
          { type: 'text', text: vars.homework_title ?? '' },
          { type: 'text', text: vars.due_date ?? '' },
        ],
      },
    ],
  },
}

/**
 * Returns the approved template spec for a given message type, or null if
 * no approved template is configured.
 */
export function getApprovedTemplate(type: MessageTemplateType): ApprovedTemplate | null {
  return APPROVED_TEMPLATES[type] ?? null
}
