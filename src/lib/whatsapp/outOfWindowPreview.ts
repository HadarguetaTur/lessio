/**
 * What a parent receives OUTSIDE the 24h customer-service window.
 *
 * The settings editor shows one body; outside the window Meta sends a different
 * one entirely — a template it has approved, whose copy is fixed and sometimes
 * is not the org's at all. An owner comparing the preview to a real message had
 * no way to know that, which is most of why the page "did not show what people
 * actually get".
 *
 * This mirrors the resolution order of sendSmartMessage / sendPaymentWithButton
 * exactly, so the second bubble on the card cannot disagree with the send:
 *
 *   1. the org's own approved template (body-only, therefore never buttoned)
 *   2. the v3 button-carrying built-in, once Meta reports it APPROVED
 *   3. the v2 built-in
 *   4. nothing — this type is only ever sent as a reply
 *
 * Pure: callers pass the status rows the page already loaded.
 */

import type { AppLocale } from '@/lib/i18n/locale'
import { param, QUICK_REPLY_TEMPLATES, URL_BUTTON_TEMPLATES } from './approvedTemplates'
import { metaTemplateBody } from './registerTemplates'
import { builtInTemplateName } from './templateApprovalView'
import type { TemplateStatusRow } from './templateStatus'
import type { MessageTemplateType } from './templates'

export type OutOfWindowPreview = {
  metaName: string
  /** 'custom' = wording the org submitted; the rest are Lessio's built-ins. */
  source: 'custom' | 'builtin_v3' | 'builtin_v2'
  status: string
  /** Already substituted with the sample values. */
  body: string
  buttons: Array<{ kind: 'quick_reply' | 'url'; label: string }>
}

/** Fills {{1}}, {{2}} … from a template's own variable order. */
function renderPositional(
  text: string,
  varOrder: string[],
  vars: Record<string, string>
): string {
  return text.replace(/\{\{(\d+)\}\}/g, (match, n: string) => {
    const name = varOrder[Number(n) - 1]
    if (!name) return match
    // Through param() so the preview shows Meta's real treatment: whitespace
    // collapsed (a multi-line charge_lines arrives as one line) and empty
    // values replaced by the fallback.
    return param(vars[name], '—').text
  })
}

function statusOf(rows: TemplateStatusRow[], name: string, locale: AppLocale): string | null {
  return rows.find((r) => r.templateName === name && r.language === locale)?.status ?? null
}

export function resolveOutOfWindowPreview(params: {
  type: MessageTemplateType
  locale: AppLocale
  rows: TemplateStatusRow[]
  previewVars: Record<string, string>
}): OutOfWindowPreview | null {
  const { type, locale, rows, previewVars } = params

  // 1. The org's own approved wording wins — sendSmart prefers it, and a
  //    body-only submission cannot carry a button.
  const custom = rows
    .filter(
      (r) =>
        r.type === type &&
        r.language === locale &&
        r.status === 'APPROVED' &&
        r.bodyText &&
        r.varOrder
    )
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0]

  if (custom?.bodyText && custom.varOrder) {
    return {
      metaName: custom.templateName,
      source: 'custom',
      status: custom.status,
      body: renderPositional(custom.bodyText, custom.varOrder, previewVars),
      buttons: [],
    }
  }

  // 2. The v3 built-in, but only once Meta has approved it — until then the
  //    senders degrade to v2, and so must the preview.
  const v3 =
    URL_BUTTON_TEMPLATES[type]?.[locale]?.name ?? QUICK_REPLY_TEMPLATES[type]?.[locale]?.name ?? null
  if (v3 && statusOf(rows, v3, locale) === 'APPROVED') {
    const built = metaTemplateBody(v3)
    if (built) {
      return {
        metaName: v3,
        source: 'builtin_v3',
        status: 'APPROVED',
        body: renderPositional(built.text, BUILTIN_VAR_ORDER[type]?.v3 ?? [], previewVars),
        buttons: built.buttons,
      }
    }
  }

  // 3. The v2 built-in.
  const v2 = builtInTemplateName(type, locale)
  if (v2) {
    const built = metaTemplateBody(v2)
    if (built) {
      return {
        metaName: v2,
        source: 'builtin_v2',
        // Built-ins are registered at connection time, so PENDING is the honest
        // default until a webhook or a refresh says otherwise.
        status: statusOf(rows, v2, locale) ?? 'PENDING',
        body: renderPositional(built.text, BUILTIN_VAR_ORDER[type]?.v2 ?? [], previewVars),
        buttons: built.buttons,
      }
    }
  }

  // 4. Reply-only type — never sent outside the window.
  return null
}

/**
 * Positional order of the built-in templates' parameters.
 *
 * These must match the `buildComponents` of approvedTemplates.ts (v2) and
 * `buildPayBodyParams` / the quick-reply senders (v3). Kept as a table rather
 * than derived, because the builders return values, not names — and pinned by
 * outOfWindowPreview.test.ts against those builders so the two cannot drift.
 */
const BUILTIN_VAR_ORDER: Partial<
  Record<MessageTemplateType, { v2?: string[]; v3?: string[] }>
> = {
  lesson_reminder: {
    v2: ['teacher_name', 'date', 'time'],
    v3: ['teacher_name', 'date', 'time'],
  },
  payment_reminder: {
    v2: ['parent_name', 'amount'],
    v3: ['parent_name', 'amount'],
  },
  payment_request: {
    v2: ['amount', 'payment_link'],
    v3: ['amount'],
  },
  homework_reminder: {
    v2: ['student_name', 'title', 'due_date'],
    v3: ['student_name', 'title', 'due_date'],
  },
  homework_assignment: {
    v2: ['title', 'body', 'due_line'],
    v3: ['title', 'body', 'due_line'],
  },
  homework_graded: { v2: ['title', 'score', 'feedback_line'] },
  day_off_decision: { v2: ['date_range', 'decision'] },
  welcome_notice: { v2: ['org_name'] },
  lesson_cancelled_by_teacher: { v2: ['teacher_name', 'date_range'] },
  // {{3}} is really balance_line + receipt_line joined; the preview shows the
  // balance sample alone, which is the common shape of a real send.
  payment_received: { v2: ['parent_name', 'amount', 'balance_line'] },
}
