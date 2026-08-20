/**
 * What the message-templates settings page shows as a template's Meta status.
 *
 * `whatsapp_template_statuses` answers "what did Meta say about submission X?"
 * The card needs a different question answered: "what is the status of the
 * wording that is saved right now?" Those diverge the moment an owner edits a
 * body after it was approved — Meta still says APPROVED about the old copy,
 * while the saved copy has never been seen by Meta at all.
 *
 * This module bridges the two without storing anything new: every submission
 * keeps the positional `body_text` it was sent with, and `buildMetaSubmission`
 * is deterministic, so "has the saved wording been submitted?" is just "does a
 * submission with this exact body_text exist?". A no-op save cannot knock an
 * approved template back to draft, and reverting to a previously approved
 * wording is recognised as approved again without a new submission.
 */

import type { AppLocale } from '@/lib/i18n/locale'
import { buildMetaSubmission, type SubmissionErrorCode } from './submitTemplate'
import type { TemplateStatusRow } from './templateStatus'
import type { MessageTemplateType } from './templates'
import { getApprovedTemplate, LESSON_CANCELLED_BY_TEACHER_TEMPLATE } from './approvedTemplates'

/** Lessio's own vocabulary for "saved but Meta has never seen it". */
export const NOT_SUBMITTED = 'NOT_SUBMITTED'

export type TemplateApprovalView = {
  /** Meta status of the saved wording, or NOT_SUBMITTED. */
  status: string
  /** Meta template name the status refers to; null when nothing was submitted. */
  metaName: string | null
  reason: string | null
  /** 'custom' = an org-authored submission; 'builtin' = Lessio's own template. */
  source: 'custom' | 'builtin'
  /**
   * What the bot actually sends outside the 24h window while the saved wording
   * is not approved — mirrors the fallback chain in sendSmart. Null when the
   * saved wording itself is what gets sent.
   */
  sendsMeanwhile: { metaName: string; source: 'custom' | 'builtin' } | null
  /** Why the saved wording cannot be submitted as-is, when it cannot. */
  validationError: { code: SubmissionErrorCode; variable?: string } | null
}

/** The Meta template Lessio itself registers for a type, if there is one. */
export function builtInTemplateName(type: MessageTemplateType, locale: AppLocale): string | null {
  if (type === 'lesson_cancelled_by_teacher') {
    return LESSON_CANCELLED_BY_TEACHER_TEMPLATE[locale].name
  }
  return getApprovedTemplate(type, locale)?.name ?? null
}

function builtInView(
  rows: TemplateStatusRow[],
  type: MessageTemplateType,
  locale: AppLocale
): TemplateApprovalView | null {
  const builtIn = builtInTemplateName(type, locale)
  if (!builtIn) return null
  const row = rows.find((r) => r.templateName === builtIn && r.language === locale)
  return {
    // Built-in templates are always registered, so PENDING is the honest
    // default until a webhook or refresh reports otherwise.
    status: row?.status ?? 'PENDING',
    metaName: builtIn,
    reason: row?.reason ?? null,
    source: 'builtin',
    sendsMeanwhile: null,
    validationError: null,
  }
}

/**
 * Resolves the card's status for one template type in one language.
 *
 * @param rows        every status row for the org (any order)
 * @param savedBody   the body the bot will use: the org's custom row, else the default
 * @param hasCustomBody whether the org saved its own wording for this type+locale
 */
export function resolveTemplateApproval(
  rows: TemplateStatusRow[],
  type: MessageTemplateType,
  locale: AppLocale,
  savedBody: string,
  hasCustomBody: boolean
): TemplateApprovalView | null {
  const submissions = rows
    .filter((r) => r.type === type && r.language === locale && r.bodyText !== null)
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))

  // Never edited, never submitted: the built-in template is the whole story.
  if (!hasCustomBody && submissions.length === 0) {
    return builtInView(rows, type, locale)
  }

  // What goes out of window right now, regardless of what is saved.
  const highestApproved = submissions.find((s) => s.status === 'APPROVED') ?? null
  const fallback: TemplateApprovalView['sendsMeanwhile'] = highestApproved
    ? { metaName: highestApproved.templateName, source: 'custom' }
    : (() => {
        const name = builtInTemplateName(type, locale)
        return name ? { metaName: name, source: 'builtin' } : null
      })()

  const built = buildMetaSubmission(type, locale, savedBody)
  if (!built.ok) {
    return {
      status: NOT_SUBMITTED,
      metaName: null,
      reason: null,
      source: 'custom',
      sendsMeanwhile: fallback,
      validationError: { code: built.code, variable: built.variable },
    }
  }

  // Highest version first, so if the same wording was somehow submitted twice
  // the newest verdict wins.
  const match = submissions.find((s) => s.bodyText === built.bodyText)

  if (!match) {
    return {
      status: NOT_SUBMITTED,
      metaName: null,
      reason: null,
      source: 'custom',
      sendsMeanwhile: fallback,
      validationError: null,
    }
  }

  return {
    status: match.status,
    metaName: match.templateName,
    reason: match.reason,
    source: 'custom',
    sendsMeanwhile: match.status === 'APPROVED' ? null : fallback,
    validationError: null,
  }
}
