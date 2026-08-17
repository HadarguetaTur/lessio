/**
 * Turns an org's own message-template body into a Meta template submission.
 *
 * The org edits one body with named variables ({{teacher_name}}); Meta only
 * understands positional ones ({{1}}). This module is the bridge: it converts,
 * validates against the rules Meta enforces, and rebuilds the parameter list at
 * send time from the variable order recorded at submission.
 *
 * Why the order is derived from the org's body rather than fixed per type:
 * the editable body and Lessio's built-in Meta template do not use the same
 * variable sets. `payment_reminder` is the clearest case — the editable body
 * offers {{amount}} and {{payment_link}}, while the built-in template's
 * parameters are parent_name and amount. Deriving from the body means an org
 * can use any variable the settings UI already advertises for that type.
 */

import type { AppLocale } from '@/lib/i18n/locale'
import type { MetaTemplateComponent } from './index'
import { param } from './approvedTemplates'
import { TEMPLATE_VARIABLES, TEMPLATE_PREVIEW_VARS, type MessageTemplateType } from './templates'
import { postTemplateToMeta } from './registerTemplates'

/** Meta's documented ceiling for a template BODY component. */
const MAX_BODY_LENGTH = 1024

/**
 * The only types worth submitting to Meta: those Lessio ever sends *outside* the
 * 24h customer-service window, where a plain-text send fails with error 131047.
 * The other twelve types are replies to an inbound message, so the window is
 * open by construction and the free-text body is used as-is.
 *
 * `lesson_cancelled_by_teacher` is out because its Meta template carries a
 * quick-reply button, which is a different submission shape — it stays on the
 * built-in template and only shows a read-only status.
 */
export const SUBMITTABLE_TYPES: MessageTemplateType[] = [
  'lesson_reminder',
  'payment_reminder',
  'payment_request',
  'homework_reminder',
  'homework_assignment',
  'homework_graded',
  'day_off_decision',
]

export function isSubmittableType(type: string): type is MessageTemplateType {
  return (SUBMITTABLE_TYPES as string[]).includes(type)
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Why a body cannot be submitted. Codes rather than sentences: the settings page
 * renders these through next-intl, so an English-speaking owner gets an English
 * explanation.
 */
export type SubmissionErrorCode =
  | 'notSubmittable'
  | 'emptyBody'
  | 'tooLong'
  | 'unknownVariable'
  | 'startsWithVariable'
  | 'endsWithVariable'

export type BuildSubmissionResult =
  | {
      ok: true
      /** Body with {{1}}, {{2}}, … in place of the named variables. */
      bodyText: string
      /** Named variables in the order they became {{1}}, {{2}}, … */
      varOrder: string[]
      /** Meta's required sample values, one per positional parameter. */
      example: string[][]
    }
  | { ok: false; code: SubmissionErrorCode; variable?: string }

const VAR_PATTERN = /\{\{(\w+)\}\}/g

/** Distinct variable names in order of first appearance. */
export function extractVarOrder(body: string): string[] {
  const seen: string[] = []
  for (const match of body.matchAll(VAR_PATTERN)) {
    if (!seen.includes(match[1])) seen.push(match[1])
  }
  return seen
}

/**
 * Converts an org's body into the Meta submission shape, or explains why it
 * cannot be converted.
 *
 * A variable used more than once maps to a single positional index, and every
 * occurrence is rewritten to it — repeating a parameter is cheaper than
 * refusing a body over a duplicate.
 */
export function buildMetaSubmission(
  type: MessageTemplateType,
  locale: AppLocale,
  body: string
): BuildSubmissionResult {
  if (!isSubmittableType(type)) return { ok: false, code: 'notSubmittable' }

  const trimmed = body.trim()
  if (!trimmed) return { ok: false, code: 'emptyBody' }

  const allowed = TEMPLATE_VARIABLES[type] ?? []
  const varOrder = extractVarOrder(trimmed)

  const unknown = varOrder.find((name) => !allowed.includes(name))
  if (unknown) return { ok: false, code: 'unknownVariable', variable: unknown }

  const bodyText = trimmed.replace(VAR_PATTERN, (_match, name: string) => {
    return `{{${varOrder.indexOf(name) + 1}}}`
  })

  // Meta rejects a body that begins or ends with a parameter (error 2388299).
  // Catching it here saves a round-trip and explains it in the owner's language;
  // see the note on lessio_payment_request_he_v2 in registerTemplates.ts.
  if (/^\{\{\d+\}\}/.test(bodyText)) return { ok: false, code: 'startsWithVariable' }
  if (/\{\{\d+\}\}$/.test(bodyText)) return { ok: false, code: 'endsWithVariable' }

  if (bodyText.length > MAX_BODY_LENGTH) return { ok: false, code: 'tooLong' }

  const previewVars = TEMPLATE_PREVIEW_VARS[type] ?? {}
  const example = varOrder.map((name) => param(previewVars[name], fallbackFor(name, locale)).text)

  // Meta wants one row of sample values; templates with no parameters send none.
  return { ok: true, bodyText, varOrder, example: example.length > 0 ? [example] : [] }
}

// ── Send-time parameter building ──────────────────────────────────────────────

/**
 * Rebuilds the body parameters for an approved org-authored template.
 *
 * Mirrors what `buildComponents` does for the built-in registry, but driven by
 * the recorded variable order instead of a hardcoded one. Every parameter goes
 * through `param`, which strips the newlines and tabs Meta rejects and swaps an
 * empty value for a non-empty placeholder (Meta rejects blank parameters too).
 */
export function buildCustomComponents(
  varOrder: string[],
  vars: Record<string, string>,
  locale: AppLocale
): MetaTemplateComponent[] {
  if (varOrder.length === 0) return []
  return [
    {
      type: 'body',
      parameters: varOrder.map((name) => param(vars[name], fallbackFor(name, locale))),
    },
  ]
}

/**
 * Stand-in for a variable that resolved to nothing at send time. Meta rejects an
 * empty body parameter outright, so every position must carry *something*; the
 * per-variable wording keeps the resulting message readable rather than
 * littering it with dashes.
 */
const VAR_FALLBACKS: Record<AppLocale, Record<string, string>> = {
  he: {
    teacher_name: 'המורה',
    student_name: 'התלמיד',
    parent_name: 'הורים יקרים',
    title: 'שיעורי בית',
    body: 'ראו פרטים באזור האישי',
    amount: '0',
    total: '0',
    score: '0',
    due_line: 'ללא תאריך הגשה',
    due_date: 'מחר',
    due_date_suffix: '',
    feedback_line: 'אין משוב נוסף.',
    decision: 'עודכנה',
    description: 'שיעור',
  },
  en: {
    teacher_name: 'your teacher',
    student_name: 'the student',
    parent_name: 'there',
    title: 'homework',
    body: 'See details in your personal area',
    amount: '0',
    total: '0',
    score: '0',
    due_line: 'No due date',
    due_date: 'tomorrow',
    due_date_suffix: '',
    feedback_line: 'No additional feedback.',
    decision: 'updated',
    description: 'a lesson',
  },
}

const GENERIC_FALLBACK = '-'

function fallbackFor(name: string, locale: AppLocale): string {
  return VAR_FALLBACKS[locale]?.[name] || VAR_FALLBACKS.he[name] || GENERIC_FALLBACK
}

// ── Naming ────────────────────────────────────────────────────────────────────

/**
 * Meta template name for an org-authored submission.
 *
 * The `_c<n>` suffix (c for custom) keeps these clear of Lessio's own `_v2`/`_v3`
 * names, and the version bumps on every submission for the reason spelled out in
 * registerTemplates.ts: editing an approved template resets it to PENDING at Meta
 * and blocks out-of-window sends, so new copy ships under a new name and the
 * previously approved one keeps working until the replacement clears review.
 */
export function customTemplateName(
  type: MessageTemplateType,
  locale: AppLocale,
  version: number
): string {
  return `lessio_${type}_${locale}_c${version}`
}

// ── Submission ────────────────────────────────────────────────────────────────

export type SubmitOutcome =
  | { ok: true; metaTemplateId: string | null }
  | { ok: false; userMessage: string | null; detail: string }

/**
 * Registers one org-authored template on the org's own WABA.
 *
 * A name collision is reported as failure rather than swallowed: unlike the
 * built-in rollout — which re-POSTs the same fixed set on every connect — a
 * duplicate here means the version counter is out of step with Meta, and
 * silently claiming success would leave the org waiting on an approval that is
 * never coming.
 */
export async function submitCustomTemplate(params: {
  wabaId: string
  accessToken: string
  name: string
  language: AppLocale
  bodyText: string
  example: string[][]
}): Promise<SubmitOutcome> {
  const { wabaId, accessToken, name, language, bodyText, example } = params

  const result = await postTemplateToMeta(wabaId, accessToken, {
    name,
    language,
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: bodyText,
        ...(example.length > 0 ? { example: { body_text: example } } : {}),
      },
    ],
  })

  if (result.outcome === 'created') {
    return { ok: true, metaTemplateId: result.id }
  }

  if (result.outcome === 'exists') {
    return { ok: false, userMessage: null, detail: `already_exists:${result.detail}` }
  }

  return {
    ok: false,
    userMessage: result.userMessage,
    detail: `${result.status} ${result.body}`.slice(0, 500),
  }
}
