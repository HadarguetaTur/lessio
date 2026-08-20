'use client'

/**
 * MessageTemplateCard — editable card for a single WhatsApp message template.
 * Per /docs/sprint-16-scope.md § Story 3.
 *
 * Features:
 * - Textarea pre-filled with custom or system-default body
 * - Variable hint showing available {{vars}} for this type
 * - Live preview using client-side substituteVars (no server round-trip)
 * - Save and Reset actions
 * - For templates sent outside the 24h window: Meta approval status of the
 *   *saved wording* and a submit-for-approval action. Saving an edit flips the
 *   status to "not submitted" straight away; the card then says which approved
 *   copy is sent out of window in the meantime.
 */

import React, { useActionState, useState, useEffect, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  saveTemplateAction,
  resetTemplateAction,
  submitTemplateForApprovalAction,
  type ActionState,
} from '@/app/(dashboard)/settings/message-templates/actions'
import { normalizeTemplateBody, substituteVars } from '@/lib/whatsapp/templates'
import type { MessageTemplateType } from '@/lib/whatsapp/templates'
import type { AppLocale } from '@/lib/i18n/locale'
import { NOT_SUBMITTED, type TemplateApprovalView } from '@/lib/whatsapp/templateApprovalView'

export type TemplateApproval = TemplateApprovalView

interface MessageTemplateCardProps {
  type: MessageTemplateType
  locale: AppLocale
  label: string
  defaultBody: string
  customBody: string | null
  variables: string[]
  previewVars: Record<string, string>
  /** This type can be submitted to Meta as an org-authored template. */
  submittable?: boolean
  /** This type is sent outside the 24h window, so Meta approval is relevant. */
  needsApproval?: boolean
  approval?: TemplateApproval | null
}

const initialState: ActionState = { error: null }

/**
 * Tailwind classes per status. Meta statuses are stored verbatim, so one we
 * have no translation for still renders — as its raw name, in neutral
 * colours — rather than blowing up the page. NOT_SUBMITTED is Lessio's own.
 */
const STATUS_STYLES: Record<string, string> = {
  NOT_SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  APPROVED: 'bg-green-50 text-green-700 border-green-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  PAUSED: 'bg-orange-50 text-orange-700 border-orange-200',
  DISABLED: 'bg-gray-100 text-gray-600 border-gray-300',
}
const NEUTRAL_STYLE = 'bg-gray-100 text-gray-600 border-gray-300'

const TRANSLATED_STATUSES = Object.keys(STATUS_STYLES)

export function MessageTemplateCard({
  type,
  locale,
  label,
  defaultBody,
  customBody,
  variables,
  previewVars,
  submittable = false,
  needsApproval = false,
  approval = null,
}: MessageTemplateCardProps) {
  const t = useTranslations('settings.messageTemplates')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveTemplateAction, initialState)
  const [body, setBody] = useState(customBody ?? defaultBody)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [submitPending, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitVariable, setSubmitVariable] = useState<string | undefined>(undefined)
  const [submitMetaMessage, setSubmitMetaMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const isCustom = customBody !== null

  // Reflect optimistic reset: if saved body becomes null, revert textarea to default
  useEffect(() => {
    if (!isCustom && body !== defaultBody) setBody(defaultBody)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustom])

  // A save changes what the approval chip refers to, so a "sent to Meta"
  // confirmation from before the edit would now sit next to "not submitted".
  useEffect(() => {
    setSubmitted(false)
  }, [customBody])

  // The saved body is what gets submitted, so unsaved edits must not be
  // silently left behind — the submit button waits for a save.
  // Compared in normalized form: the DB copy of a body saved before
  // normalization-on-save carries CRLF, the textarea's value never does, and an
  // invisible mismatch here kept the submit button disabled after every save.
  const savedBody = customBody ?? defaultBody
  const hasUnsavedEdits = normalizeTemplateBody(body) !== normalizeTemplateBody(savedBody)

  async function handleReset() {
    setResetPending(true)
    setResetError(null)
    const result = await resetTemplateAction(type, locale)
    setResetPending(false)
    if (result.error) {
      setResetError(result.error)
    }
  }

  function handleSubmitForApproval() {
    setSubmitError(null)
    setSubmitVariable(undefined)
    setSubmitMetaMessage(null)
    setSubmitted(false)
    startSubmit(async () => {
      const result = await submitTemplateForApprovalAction(type, locale)
      if (result.error) {
        setSubmitError(result.error)
        setSubmitVariable(result.variable)
        setSubmitMetaMessage(result.metaMessage ?? null)
        return
      }
      setSubmitted(true)
    })
  }

  const preview = substituteVars(body, previewVars)

  // Nothing to submit while Meta is already reviewing exactly this wording, or
  // has approved it — a second submission would just open a duplicate review.
  // A built-in APPROVED does not count: that is Lessio's copy, not the org's.
  const alreadyAtMeta =
    approval?.source === 'custom' &&
    (approval.status === 'PENDING' || approval.status === 'APPROVED')
  const cannotSubmit = Boolean(approval?.validationError)
  const savedNotApproved = needsApproval && approval?.status === NOT_SUBMITTED

  const statusClass = approval ? STATUS_STYLES[approval.status] ?? NEUTRAL_STYLE : NEUTRAL_STYLE
  const statusLabel = approval
    ? TRANSLATED_STATUSES.includes(approval.status)
      ? t(`status.${approval.status}`)
      : approval.status
    : t('status.UNKNOWN')

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        {isCustom && (
          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5 font-medium">
            {t('saved')}
          </span>
        )}
      </div>

      {/* Variable hint */}
      {variables.length > 0 && (
        <div className="text-xs text-gray-500">
          <span className="font-medium">{t('variables')}: </span>
          {variables.map((v, i) => (
            <span key={v}>
              <code className="bg-gray-100 text-gray-700 px-1 rounded font-mono">{`{{${v}}}`}</code>
              {i < variables.length - 1 && <span className="text-gray-400">, </span>}
            </span>
          ))}
        </div>
      )}

      {/* Save form */}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="locale" value={locale} />
        <textarea
          name="body_template"
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          dir={locale === 'he' ? 'rtl' : 'ltr'}
          className={`w-full text-sm border rounded-md px-3 py-2 resize-y font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            customBody === null ? 'text-gray-400 border-gray-200 bg-gray-50' : 'text-gray-900 border-gray-300 bg-white'
          }`}
          placeholder={defaultBody}
        />

        {state.error && (
          <p className="text-xs text-red-600">{state.error}</p>
        )}
        {state.success && !hasUnsavedEdits && (
          <p className="text-xs text-green-600">
            {savedNotApproved ? t('savedNeedsApproval') : t('saved')}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? `${tCommon('actions.save')}…` : tCommon('actions.save')}
          </button>

          {isCustom && (
            <button
              type="button"
              onClick={handleReset}
              disabled={resetPending}
              className="px-4 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {resetPending ? `${t('reset')}…` : t('reset')}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPreview(p => !p)}
            className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors underline"
          >
            {showPreview ? tCommon('actions.close') : t('preview')}
          </button>
        </div>

        {resetError && (
          <p className="text-xs text-red-600">{resetError}</p>
        )}
      </form>

      {/* Live preview */}
      {showPreview && (
        <div className="border border-gray-200 rounded-md bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500 mb-2">{t('preview')}:</p>
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed" dir={locale === 'he' ? 'rtl' : 'ltr'}>
            {preview}
          </pre>
        </div>
      )}

      {/* Meta approval */}
      {needsApproval ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500">{t('metaStatus')}:</span>

            <span className={`text-xs border rounded px-2 py-0.5 font-medium ${statusClass}`}>
              {statusLabel}
            </span>

            {approval?.metaName && (
              <code className="text-[11px] text-gray-400 font-mono" dir="ltr">
                {approval.metaName}
              </code>
            )}

            {approval?.source === 'builtin' && (
              <span className="text-[11px] text-gray-400">{t('builtInTemplate')}</span>
            )}
          </div>

          {approval?.reason && (
            <p className="text-xs text-red-600">
              {t('rejectionReason')}: {approval.reason}
            </p>
          )}

          {approval?.validationError && (
            <p className="text-xs text-red-600">
              {t('cannotSubmit')}{' '}
              {approval.validationError.code === 'unknownVariable'
                ? t('errors.unknownVariable', { variable: approval.validationError.variable ?? '' })
                : t(`errors.${approval.validationError.code}`)}
            </p>
          )}

          {approval?.sendsMeanwhile && (
            <p className="text-xs text-amber-700">
              {approval.sendsMeanwhile.source === 'builtin'
                ? t('sendsMeanwhileBuiltIn')
                : t('sendsMeanwhile')}{' '}
              <code className="font-mono text-[11px]" dir="ltr">{approval.sendsMeanwhile.metaName}</code>
            </p>
          )}

          {submittable ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSubmitForApproval}
                  disabled={submitPending || hasUnsavedEdits || alreadyAtMeta || cannotSubmit}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {submitPending ? `${t('submitForApproval')}…` : t('submitForApproval')}
                </button>
                {hasUnsavedEdits && (
                  <span className="text-xs text-gray-500">{t('saveBeforeSubmit')}</span>
                )}
              </div>

              {submitError && (
                <p className="text-xs text-red-600">
                  {submitError === 'unknownVariable'
                    ? t('errors.unknownVariable', { variable: submitVariable ?? '' })
                    : t(`errors.${submitError}`)}
                  {submitMetaMessage && <span className="block text-gray-500">{submitMetaMessage}</span>}
                </p>
              )}
              {submitted && <p className="text-xs text-green-600">{t('submittedToMeta')}</p>}
            </>
          ) : (
            <p className="text-xs text-gray-500">{t('builtInOnly')}</p>
          )}
        </div>
      ) : (
        <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">{t('inWindowOnly')}</p>
      )}
    </div>
  )
}
