'use client'

/**
 * MessageTemplateCard — editable card for a single WhatsApp message template.
 * Per /docs/sprint-16-scope.md § Story 3.
 *
 * Collapsed to a single row by default: twenty open forms in one column made
 * this page roughly 24,000px tall, so nothing could be found by scrolling.
 *
 * Features:
 * - Textarea pre-filled with custom or system-default body
 * - Clickable chips for the {{vars}} this type accepts, inserted at the caret
 * - Live preview using client-side substituteVars (no server round-trip)
 * - Save and Reset actions
 * - For templates sent outside the 24h window: Meta approval status of the
 *   *saved wording* and a submit-for-approval action. Saving an edit flips the
 *   status to "not submitted" straight away; the card then says which approved
 *   copy is sent out of window in the meantime.
 */

import React, { useActionState, useState, useEffect, useRef, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import {
  saveTemplateAction,
  resetTemplateAction,
  saveButtonLabelAction,
  sendTestTemplateAction,
  submitTemplateForApprovalAction,
  type ActionState,
  type SendTestResult,
} from '@/app/(dashboard)/settings/message-templates/actions'
import { useTestPhone } from '@/components/dashboard/settings/TestPhone'
import { WhatsAppPreview } from '@/components/dashboard/settings/WhatsAppPreview'
import {
  BUTTON_LABEL_MAX,
  buttonsFor,
  clipButtonLabel,
  type TemplateButton,
} from '@/lib/whatsapp/templateButtons'
import {
  normalizeTemplateBody,
  stripStandaloneVarLine,
  substituteVars,
} from '@/lib/whatsapp/templates'
import type { MessageTemplateType } from '@/lib/whatsapp/templates'
import type { AppLocale } from '@/lib/i18n/locale'
import { NOT_SUBMITTED, type TemplateApprovalView } from '@/lib/whatsapp/templateApprovalView'
import type { OutOfWindowPreview } from '@/lib/whatsapp/outOfWindowPreview'

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
  /**
   * The label each of this type's buttons currently carries — the org's own
   * wording where it set one, Lessio's otherwise. Resolved on the server so the
   * card does not need the string tables.
   */
  buttonLabels?: Record<string, string>
  /**
   * The message as it goes out OUTSIDE the 24h window — a Meta-approved
   * template with fixed copy, which for most types is not the body above.
   * Null when this type is only ever sent as a reply.
   */
  outOfWindowPreview?: OutOfWindowPreview | null
}

const initialState: ActionState = { error: null }

/**
 * Tailwind classes per status. Meta statuses are stored verbatim, so one we
 * have no translation for still renders — as its raw name, in neutral
 * colours — rather than blowing up the page. NOT_SUBMITTED is Lessio's own.
 */
const STATUS_STYLES: Record<string, string> = {
  NOT_SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  // Listed so it renders translated rather than as the raw word: it is what a
  // card shows when Meta could not be reached, which is a real state an owner
  // sees, not a parse failure.
  UNKNOWN: 'bg-gray-100 text-gray-600 border-gray-300',
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
  buttonLabels = {},
  outOfWindowPreview = null,
}: MessageTemplateCardProps) {
  const t = useTranslations('settings.messageTemplates')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveTemplateAction, initialState)
  const [body, setBody] = useState(customBody ?? defaultBody)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetPending, setResetPending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [submitPending, startSubmit] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitVariable, setSubmitVariable] = useState<string | undefined>(undefined)
  const [submitMetaMessage, setSubmitMetaMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({})
  const isCustom = customBody !== null
  const buttons = buttonsFor(type)

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

  /** Drop {{var}} where the caret is, not at the end of the message. */
  function insertVariable(variable: string) {
    const token = `{{${variable}}}`
    const el = textareaRef.current
    if (!el) {
      setBody((b) => b + token)
      return
    }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? start
    setBody(body.slice(0, start) + token + body.slice(end))
    const caret = start + token.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  // Labels shown in the preview follow the editor live: typing a new label and
  // watching the bubble change is the whole reason the two sit together.
  const labels: Record<string, string> = { ...buttonLabels, ...labelDrafts }

  // The preview runs the SAME pipeline as a real send: the URL line is lifted
  // out of the body and becomes the button. Substituting first and drawing both
  // is what made the old preview show a link the parent never sees twice.
  //
  // stripStandaloneVarLine returning null means the org wrote the URL
  // mid-sentence; the senders honour that by keeping the text form and dropping
  // the button, so the preview must too.
  const urlButton = buttons.find((b) => b.kind === 'url' && b.urlVar)
  const strippedBody = urlButton?.urlVar
    ? stripStandaloneVarLine(body, urlButton.urlVar)
    : null
  const buttonSuppressed = Boolean(urlButton) && strippedBody === null
  const preview = substituteVars(strippedBody ?? body, previewVars)
  const previewButtons = buttonSuppressed ? [] : buttons
  // The collapsed row has to say something about the message itself; the label
  // alone does not distinguish twenty templates.
  const firstLine = body.split('\n').find((line) => line.trim().length > 0)?.trim() ?? ''

  // Nothing to submit while Meta is already reviewing exactly this wording, or
  // has approved it — a second submission would just open a duplicate review.
  // A built-in APPROVED does not count: that is Lessio's copy, not the org's.
  const alreadyAtMeta =
    approval?.source === 'custom' &&
    (approval.status === 'PENDING' || approval.status === 'APPROVED')
  const cannotSubmit = Boolean(approval?.validationError)
  const savedNotApproved = needsApproval && approval?.status === NOT_SUBMITTED

  const STATUS_HINT_KEYS: Record<string, string> = {
    APPROVED: 'approved',
    PENDING: 'pending',
    REJECTED: 'rejected',
  }
  const statusHintKey = approval ? STATUS_HINT_KEYS[approval.status] : undefined

  const statusClass = approval ? STATUS_STYLES[approval.status] ?? NEUTRAL_STYLE : NEUTRAL_STYLE
  const statusLabel = approval
    ? TRANSLATED_STATUSES.includes(approval.status)
      ? t(`status.${approval.status}`)
      : approval.status
    : t('status.UNKNOWN')

  return (
    <details className="group bg-white border border-gray-200 rounded-lg">
      {/* Collapsed row: name, state, and the opening line of the message. */}
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={15}
          className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">{label}</span>
          {firstLine && (
            <span
              className="block truncate text-xs text-muted-foreground"
              dir={locale === 'he' ? 'rtl' : 'ltr'}
            >
              {firstLine}
            </span>
          )}
        </span>
        {isCustom && (
          <span className="shrink-0 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5 font-medium">
            {t('saved')}
          </span>
        )}
        {needsApproval && (
          <span className={`shrink-0 text-xs border rounded px-2 py-0.5 font-medium ${statusClass}`}>
            {statusLabel}
          </span>
        )}
      </summary>

      <div className="space-y-4 border-t border-gray-100 p-5">
      {/* Save form */}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="locale" value={locale} />
        <textarea
          ref={textareaRef}
          name="body_template"
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          dir={locale === 'he' ? 'rtl' : 'ltr'}
          className={`w-full text-sm border rounded-md px-3 py-2 resize-y font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            customBody === null ? 'text-muted-foreground border-gray-200 bg-gray-50' : 'text-gray-900 border-gray-300 bg-white'
          }`}
          placeholder={defaultBody}
        />

        {/* Variables are clickable, not a list to copy by hand. */}
        {variables.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('variables')}:</span>
            {variables.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                title={t('insertVariable')}
                className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                dir="ltr"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        )}

        {state.error && (
          <p className="text-xs text-red-600">{state.error}</p>
        )}
        {state.success && !hasUnsavedEdits && (
          <p className="text-xs text-green-700">
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
            className="px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-gray-700 transition-colors underline"
          >
            {showPreview ? tCommon('actions.close') : t('preview')}
          </button>
        </div>

        {resetError && (
          <p className="text-xs text-red-600">{resetError}</p>
        )}
      </form>

      <SendTestRow type={type} locale={locale} />

      {/* Live preview — the message as WhatsApp draws it, buttons included.
          Two bubbles, because the same message goes out two different ways: the
          body above inside the 24h window, a Meta-approved template outside it. */}
      {showPreview && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('previewPane.inWindow')}
            </p>
            <WhatsAppPreview
              body={preview}
              buttons={previewButtons.map((b) => ({
                label: clipButtonLabel(labels[b.labelKey] ?? '', b.kind),
                kind: b.kind,
              }))}
              locale={locale}
            />
            {buttonSuppressed && (
              <p className="text-xs text-amber-700">{t('previewPane.buttonSuppressed')}</p>
            )}
          </div>

          {needsApproval && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('previewPane.outOfWindow')}
              </p>
              {outOfWindowPreview ? (
                <>
                  <WhatsAppPreview
                    body={outOfWindowPreview.body}
                    buttons={outOfWindowPreview.buttons.map((b) => ({
                      label: clipButtonLabel(b.label, b.kind),
                      kind: b.kind,
                    }))}
                    locale={locale}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                      {outOfWindowPreview.metaName}
                    </code>
                    <span
                      className={`text-xs border rounded px-2 py-0.5 font-medium ${
                        STATUS_STYLES[outOfWindowPreview.status] ?? NEUTRAL_STYLE
                      }`}
                    >
                      {TRANSLATED_STATUSES.includes(outOfWindowPreview.status)
                        ? t(`status.${outOfWindowPreview.status}`)
                        : outOfWindowPreview.status}
                    </span>
                  </div>
                  {outOfWindowPreview.source !== 'custom' && (
                    <p className="text-xs text-muted-foreground">
                      {t('previewPane.outOfWindowBuiltIn')}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{t('previewPane.outOfWindowNone')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Button labels */}
      {buttons.length > 0 && (
        <ButtonLabelsSection
          buttons={buttons}
          labels={labels}
          locale={locale}
          onDraftChange={setLabelDrafts}
        />
      )}

      {/* Meta approval */}
      {needsApproval ? (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">{t('metaStatus')}:</span>

            <span className={`text-xs border rounded px-2 py-0.5 font-medium ${statusClass}`}>
              {statusLabel}
            </span>

            {approval?.metaName && (
              <code
                className="text-[11px] text-muted-foreground font-mono"
                dir="ltr"
                title={t('metaNameHint')}
              >
                {approval.metaName}
              </code>
            )}

            {approval?.source === 'builtin' && (
              <span className="text-[11px] text-muted-foreground">{t('builtInTemplate')}</span>
            )}
          </div>

          {/* APPROVED / PENDING mean nothing to a tutor on their own — say what
              each one costs her in messages that do or do not go out. */}
          {statusHintKey && (
            <p className="text-xs text-muted-foreground">
              {t(`statusHint.${statusHintKey}` as 'statusHint.approved')}
            </p>
          )}

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
                  <span className="text-xs text-muted-foreground">{t('saveBeforeSubmit')}</span>
                )}
              </div>

              {submitError && (
                <p className="text-xs text-red-600">
                  {submitError === 'unknownVariable'
                    ? t('errors.unknownVariable', { variable: submitVariable ?? '' })
                    : t(`errors.${submitError}`)}
                  {submitMetaMessage && <span className="block text-muted-foreground">{submitMetaMessage}</span>}
                </p>
              )}
              {submitted && <p className="text-xs text-green-700">{t('submittedToMeta')}</p>}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t('builtInOnly')}</p>
          )}
        </div>
      ) : (
        <p className="border-t border-gray-100 pt-3 text-xs text-muted-foreground">{t('inWindowOnly')}</p>
      )}
      </div>
    </details>
  )
}

/**
 * The buttons this message carries, and — where the wording is the org's to
 * choose — an input for each.
 *
 * Labels on a Meta-approved template are locked: Meta approved that exact
 * wording, and changing it means a new template version and another review.
 * Showing them greyed with a reason beats hiding them, because a tutor
 * comparing the preview to a real message needs to know why one field is
 * editable and the next is not.
 */
function ButtonLabelsSection({
  buttons,
  labels,
  locale,
  onDraftChange,
}: {
  buttons: TemplateButton[]
  labels: Record<string, string>
  locale: AppLocale
  onDraftChange: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const t = useTranslations('settings.messageTemplates')
  const editable = buttons.filter((b) => b.editable)
  const locked = buttons.filter((b) => !b.editable)

  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-muted-foreground">{t('buttons.title')}</p>

      {editable.map((button) => (
        <ButtonLabelRow
          key={button.labelKey}
          labelKey={button.labelKey}
          value={labels[button.labelKey] ?? ''}
          locale={locale}
          onDraftChange={onDraftChange}
        />
      ))}

      {locked.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {locked.map((button, i) => (
              <span
                key={`${button.labelKey}-${i}`}
                className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
              >
                {labels[button.labelKey]}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('buttons.lockedByMeta')}</p>
        </div>
      )}
    </div>
  )
}

/** One editable label: an input that updates the preview as it is typed. */
function ButtonLabelRow({
  labelKey,
  value,
  locale,
  onDraftChange,
}: {
  labelKey: string
  value: string
  locale: AppLocale
  onDraftChange: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const t = useTranslations('settings.messageTemplates')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(saveButtonLabelAction, initialState)
  const [draft, setDraft] = useState(value)

  function handleChange(next: string) {
    setDraft(next)
    onDraftChange((drafts) => ({ ...drafts, [labelKey]: next }))
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="key" value={labelKey} />
      <input type="hidden" name="locale" value={locale} />
      <input
        name="value"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        maxLength={BUTTON_LABEL_MAX}
        dir={locale === 'he' ? 'rtl' : 'ltr'}
        className="w-48 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={isPending || draft.trim().length === 0 || draft === value}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        {isPending ? `${tCommon('actions.save')}…` : tCommon('actions.save')}
      </button>
      <span className="text-[11px] text-muted-foreground">
        {t('buttons.maxLength', { max: String(BUTTON_LABEL_MAX) })}
      </span>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  )
}

const initialSendTestState: SendTestResult = { error: null }

/**
 * "Send this one to my own number."
 *
 * The number itself lives once at the top of the page (TestPhoneProvider), so
 * this row is just the button plus whatever the action said.
 */
function SendTestRow({ type, locale }: { type: MessageTemplateType; locale: AppLocale }) {
  const t = useTranslations('settings.messageTemplates.test')
  const { phone } = useTestPhone()
  const [state, formAction, isPending] = useActionState(
    sendTestTemplateAction,
    initialSendTestState
  )
  const trimmed = phone.trim()

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="templateType" value={type} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="phone" value={trimmed} />
      <button
        type="submit"
        disabled={isPending || trimmed.length === 0}
        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {isPending ? t('sending') : t('send')}
      </button>
      {trimmed.length === 0 && (
        <span className="text-xs text-muted-foreground">{t('missingPhone')}</span>
      )}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state.success && !state.error && (
        <span className="text-xs text-green-700">{t('sent')}</span>
      )}
    </form>
  )
}
