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
export function param(
  value: string | undefined,
  fallback: string,
  maxLen?: number
): { type: 'text'; text: string } {
  let text = (value ?? '').replace(/\s+/g, ' ').trim()
  if (maxLen !== undefined && text.length > maxLen) {
    text = `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`
  }
  return { type: 'text', text: text || fallback }
}

/**
 * The amount as a Meta template parameter: a bare number, not formatted money.
 *
 * The approved v2/v3 payment bodies carry a literal '₪' in front of their
 * placeholder — that copy is what Meta reviewed and cannot be edited without
 * resetting the template to PENDING. The free-text template bodies dropped
 * their symbol so a non-ILS org is not sent a shekel sign, and their `amount`
 * is now a formatted string. Feeding that string to these parameters would
 * render '₪₪250.00', so callers pass the raw figure alongside as
 * `amount_value` and every approved-template builder reads it through here.
 *
 * When the v4 set (no literal symbol) is approved, this becomes `vars.amount`.
 */
export function metaAmountParam(vars: Record<string, string>) {
  return param(vars.amount_value ?? vars.amount, '0')
}

/**
 * Meta caps a rendered template body (fixed copy + substituted parameters) at
 * 1024 characters and rejects the whole send otherwise. Free-text fields that a
 * teacher types (homework title/body, grading feedback) are the only inputs
 * that can realistically blow that budget, so they are truncated here. The
 * budgets leave comfortable headroom for the fixed copy in both languages.
 */
export const PARAM_LIMITS = {
  homework_title: 150,
  homework_body: 600,
  homework_feedback: 500,
  exam_title: 150,
  /** One paragraph a business types into a broadcast; see broadcastTemplates(). */
  broadcast_message: 700,
  broadcast_topic: 80,
  broadcast_group_name: 80,
} as const

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
          metaAmountParam(vars),
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
          metaAmountParam(vars),
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
          param(vars.homework_title ?? vars.title, 'שיעורי בית', PARAM_LIMITS.homework_title),
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
          param(vars.title, 'שיעורי בית', PARAM_LIMITS.homework_title),
          param(vars.body, 'ראו פרטים באזור האישי', PARAM_LIMITS.homework_body),
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
          param(vars.title, 'שיעורי בית', PARAM_LIMITS.homework_title),
          param(vars.score, '0'),
          param(vars.feedback_line, 'אין משוב נוסף.', PARAM_LIMITS.homework_feedback),
        ],
      },
    ],
  },

  day_off_decision: {
    // The decision can reach the teacher days after they last wrote in, so it
    // must survive a closed 24h window.
    name: 'lessio_day_off_decision_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.date_range, ''),
          param(vars.decision, 'עודכנה'),
        ],
      },
    ],
  },

  welcome_notice: {
    // The one-time opt-in notice (src/lib/whatsapp/consent.ts). Always a cold
    // start, so always a template.
    name: 'lessio_welcome_notice_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [param(vars.org_name, 'בית הספר')],
      },
    ],
  },

  exam_good_luck: {
    // The morning of an exam. The student (or their parent) has no reason to
    // have written in first, so this is a cold start by construction.
    name: 'lessio_exam_good_luck_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.student_name, 'התלמיד'),
          param(vars.subject, 'המבחן'),
          param(vars.title, 'מבחן', PARAM_LIMITS.exam_title),
        ],
      },
    ],
  },

  pack_low_balance: {
    // A punch card running low (decision #46, M2). Sent after a lesson is
    // settled, typically long after the parent last wrote in.
    name: 'lessio_pack_low_balance_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.parent_name, 'הורים יקרים'),
          param(vars.pack_name, 'הכרטיסייה'),
          param(vars.student_name, 'התלמיד'),
          param(vars.remaining, '0'),
        ],
      },
    ],
  },

  pack_exhausted: {
    name: 'lessio_pack_exhausted_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.parent_name, 'הורים יקרים'),
          param(vars.pack_name, 'הכרטיסייה'),
          param(vars.student_name, 'התלמיד'),
        ],
      },
    ],
  },

  payment_received: {
    // Confirms a payment the tutor recorded by hand, usually days after the
    // parent last wrote in — so almost always outside the window. {{3}} is the
    // optional tail (remaining balance and/or receipt link); Meta rejects an
    // empty parameter, so an empty tail becomes a closing line instead.
    name: 'lessio_payment_received_he_v2',
    languageCode: 'he',
    buildComponents: (vars) => [
      {
        type: 'body',
        parameters: [
          param(vars.parent_name, 'הורים יקרים'),
          // Formatted money on purpose: the registered body has no '₪' of its own.
          param(vars.amount, ''),
          param(
            [vars.balance_line, vars.receipt_line].filter(Boolean).join(' '),
            vars.payment_received_closing || 'הכל מסודר.'
          ),
        ],
      },
    ],
  },
}

/**
 * Meta template names for the parent notice sent when an owner approves a
 * teacher's day off.
 *
 * It lives outside APPROVED_TEMPLATES because it is registered WITH a
 * quick-reply button: sendTemplateMessage would post it without the button
 * component and Meta rejects that mismatch, so it goes out through
 * sendTemplateWithQuickReplies, which binds the payload at send time.
 */
export const LESSON_CANCELLED_BY_TEACHER_TEMPLATE: Record<
  AppLocale,
  { name: string; languageCode: string }
> = {
  he: { name: 'lessio_lesson_cancelled_by_teacher_he_v2', languageCode: 'he' },
  en: { name: 'lessio_lesson_cancelled_by_teacher_en_v2', languageCode: 'en' },
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
          subject: vars.subject || 'the exam',
          feedback_line: vars.feedback_line || 'No additional feedback.',
          decision: vars.decision || 'updated',
          org_name: vars.org_name || 'your tutor',
          payment_received_closing: vars.payment_received_closing || 'Everything is settled.',
          pack_name: vars.pack_name || 'your pack',
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

// ── Button-carrying templates (v3) ────────────────────────────────────────────

/** A Meta template registered WITH buttons, addressed by name and language. */
export type ButtonTemplate = { name: string; languageCode: string }

/**
 * Reminder templates registered with quick-reply buttons.
 *
 * These live apart from APPROVED_TEMPLATES for the same reason
 * LESSON_CANCELLED_BY_TEACHER_TEMPLATE does: sendTemplateMessage posts a
 * body-only component list, and Meta rejects that against a template that has
 * buttons. They go out through sendTemplateWithQuickReplies, which binds the
 * payload at send time — so one approved template serves every lesson and
 * every assignment.
 *
 * The body copy is identical to the v2 entry of the same type, which is what
 * lets the send path reuse buildBodyParams and degrade to v2 unchanged while
 * these are still PENDING at Meta.
 */
export const QUICK_REPLY_TEMPLATES: Partial<
  Record<MessageTemplateType, Record<AppLocale, ButtonTemplate>>
> = {
  lesson_reminder: {
    he: { name: 'lessio_lesson_reminder_he_v3', languageCode: 'he' },
    en: { name: 'lessio_lesson_reminder_en_v3', languageCode: 'en' },
  },
  homework_assignment: {
    he: { name: 'lessio_homework_assignment_he_v3', languageCode: 'he' },
    en: { name: 'lessio_homework_assignment_en_v3', languageCode: 'en' },
  },
  homework_reminder: {
    he: { name: 'lessio_homework_reminder_he_v3', languageCode: 'he' },
    en: { name: 'lessio_homework_reminder_en_v3', languageCode: 'en' },
  },
}

/**
 * Payment templates registered with a URL button pointing at /pay/<chargeId>.
 *
 * Unlike the quick-reply set, the v3 bodies here differ from v2: the bare link
 * line is gone, replaced by the button. So the body parameters differ too —
 * payment_request takes the amount alone, not amount + link.
 */
export const URL_BUTTON_TEMPLATES: Partial<
  Record<MessageTemplateType, Record<AppLocale, ButtonTemplate>>
> = {
  payment_request: {
    he: { name: 'lessio_payment_request_he_v3', languageCode: 'he' },
    en: { name: 'lessio_payment_request_en_v3', languageCode: 'en' },
  },
  payment_reminder: {
    he: { name: 'lessio_payment_reminder_he_v3', languageCode: 'he' },
    en: { name: 'lessio_payment_reminder_en_v3', languageCode: 'en' },
  },
}

/**
 * The same templates without a hardcoded '₪', for orgs whose v4 set Meta has
 * already approved.
 *
 * v3 and v4 differ ONLY in who prints the currency symbol, so they need
 * different parameters for the same amount: v3's copy says "₪{{1}}" and takes
 * the bare figure, v4 says "{{1}}" and takes the formatted money. Picking the
 * template and building its parameters therefore has to happen together — see
 * sendPaymentWithButton.
 *
 * Until Meta approves these, the senders stay on v3 and nothing changes.
 */
export const URL_BUTTON_TEMPLATES_V4: Partial<
  Record<MessageTemplateType, Record<AppLocale, ButtonTemplate>>
> = {
  payment_request: {
    he: { name: 'lessio_payment_request_he_v4', languageCode: 'he' },
    en: { name: 'lessio_payment_request_en_v4', languageCode: 'en' },
  },
  payment_reminder: {
    he: { name: 'lessio_payment_reminder_he_v4', languageCode: 'he' },
    en: { name: 'lessio_payment_reminder_en_v4', languageCode: 'en' },
  },
}

// ── Broadcast templates (Phase 0) ─────────────────────────────────────────────

/** The three broadcast message types; see broadcastTemplates() in registerTemplates.ts. */
export type BroadcastTemplateType = Extract<MessageTemplateType, 'class_update' | 'promo' | 'group_invite'>

/**
 * Broadcast templates, by type and language. Every one is registered WITH a
 * button (the category opt-out, or the join-group URL), so like the other
 * button sets they never go through sendTemplateMessage's body-only components.
 * Body parameters come from broadcastBodyParams below; the URL suffix for
 * group_invite is the invite code, bound at send time.
 */
export const BROADCAST_TEMPLATES: Record<BroadcastTemplateType, Record<AppLocale, ButtonTemplate>> = {
  class_update: {
    he: { name: 'lessio_class_update_he_v1', languageCode: 'he' },
    en: { name: 'lessio_class_update_en_v1', languageCode: 'en' },
  },
  promo: {
    he: { name: 'lessio_promo_he_v1', languageCode: 'he' },
    en: { name: 'lessio_promo_en_v1', languageCode: 'en' },
  },
  group_invite: {
    he: { name: 'lessio_group_invite_he_v1', languageCode: 'he' },
    en: { name: 'lessio_group_invite_en_v1', languageCode: 'en' },
  },
}

/** Meta category of each broadcast type — the send guard keys its rules on this. */
export const BROADCAST_CATEGORY: Record<BroadcastTemplateType, 'UTILITY' | 'MARKETING'> = {
  class_update: 'UTILITY',
  promo: 'MARKETING',
  group_invite: 'UTILITY',
}

/**
 * Body parameters for a broadcast template, in registration order, normalised
 * through param() (whitespace collapsed, capped by PARAM_LIMITS).
 *
 * The invite code for group_invite is NOT a body parameter — it is the URL
 * button's suffix, which the sender binds separately.
 */
export function broadcastBodyParams(
  type: BroadcastTemplateType,
  locale: AppLocale,
  vars: Record<string, string>
): string[] {
  const orgFallback = locale === 'he' ? 'בית הספר' : 'your tutor'
  const org = param(vars.org_name, orgFallback).text
  switch (type) {
    case 'class_update':
      return [
        org,
        param(vars.topic, locale === 'he' ? 'השיעור' : 'the lesson', PARAM_LIMITS.broadcast_topic).text,
        param(vars.message, '', PARAM_LIMITS.broadcast_message).text,
      ]
    case 'promo':
      return [org, param(vars.message, '', PARAM_LIMITS.broadcast_message).text]
    case 'group_invite':
      return [
        org,
        param(vars.group_name, locale === 'he' ? 'הקבוצה' : 'the group', PARAM_LIMITS.broadcast_group_name).text,
      ]
  }
}

/**
 * The body parameters for a type, as the plain strings
 * sendTemplateWithQuickReplies expects.
 *
 * Derived from the v2 spec's buildComponents rather than rebuilt, so the
 * empty/newline normalisation in param() and every language fallback apply to
 * the button templates too. Returns null when the type has no approved spec.
 */
export function buildBodyParams(
  type: MessageTemplateType,
  locale: AppLocale,
  vars: Record<string, string>
): string[] | null {
  const spec = getApprovedTemplate(type, locale) ?? getApprovedTemplate(type, 'he')
  if (!spec) return null

  const body = spec.buildComponents(vars).find((c) => c.type === 'body')
  if (!body) return null

  return body.parameters.map((p) => (p.type === 'text' ? p.text : ''))
}
