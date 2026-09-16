'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { CollectionPolicy } from '@/lib/cancellation-policy/collection'

type ActionState = { error: string } | { success: true } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

interface CancellationPolicyFormProps {
  action: FormAction
  defaultValues: {
    notice_hours_full: number
    notice_hours_partial: number
    partial_charge_percent: number
  }
  /** No-show and punch-card settings (decision #46). */
  collection: CollectionPolicy
  billingMode: 'monthly' | 'per_lesson'
  readOnly?: boolean
}

const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-muted-foreground'

export function CancellationPolicyForm({
  action,
  defaultValues,
  collection,
  billingMode,
  readOnly = false,
}: CancellationPolicyFormProps) {
  const t = useTranslations('settings.cancellationPolicy')
  const [state, formAction, pending] = useActionState(action, null)

  // The server already rejects an out-of-range percentage, but the browser's
  // own `max="100"` bubble fired first and silently swallowed the submit — and
  // that bubble is written in the *browser's* language, so a Hebrew RTL screen
  // showed "Value must be less than or equal to 100." or nothing at all.
  // noValidate hands the checks to us so every message is in the app's language
  // and lands in the same red box as the server's.
  const [clientError, setClientError] = useState<string | null>(null)

  // Controlled, so the "how it works" summary below reads what is on screen.
  // It used to interpolate defaultValues — the server's numbers — so editing
  // 24 to 48 left the three rules underneath still saying 24, and the one
  // element that makes the policy legible disagreed with the form
  // (UX audit F13).
  const [fullHours, setFullHours] = useState(String(defaultValues.notice_hours_full))
  const [partialHours, setPartialHours] = useState(String(defaultValues.notice_hours_partial))
  const [percent, setPercent] = useState(String(defaultValues.partial_charge_percent))
  const [noShowPercent, setNoShowPercent] = useState(String(collection.noShowChargePercent))
  const [threshold, setThreshold] = useState(String(collection.packLowBalanceThreshold))

  const full = Number(fullHours)
  const partial = Number(partialHours)
  const pct = Number(percent)
  const noShowPct = Number(noShowPercent)
  const lowThreshold = Number(threshold)

  function validate(): string | null {
    if (!Number.isFinite(full) || full < 1) return t('errors.fullHoursPositive')
    if (!Number.isFinite(partial) || partial < 0) return t('errors.partialHoursPositive')
    if (partial >= full) return t('errors.partialLessThanFull')
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return t('errors.percentRange')
    if (!Number.isInteger(noShowPct) || noShowPct < 0 || noShowPct > 100) return t('errors.noShowPercentRange')
    if (!Number.isInteger(lowThreshold) || lowThreshold < 0 || lowThreshold > 100) return t('errors.thresholdRange')
    return null
  }

  const shownError = clientError ?? ('error' in (state ?? {}) ? (state as { error: string }).error : null)

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(e) => {
        const problem = validate()
        setClientError(problem)
        if (problem) e.preventDefault()
      }}
      className="space-y-6 max-w-lg"
    >
      {shownError && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-md">
          {shownError}
        </div>
      )}
      {!clientError && 'success' in (state ?? {}) && (
        <div role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-md">
          {t('saved')}
        </div>
      )}

      {/* ── Cancellations ───────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-5" aria-labelledby="policy-cancellations">
        <h2 id="policy-cancellations" className="text-sm font-semibold text-gray-900">{t('sections.cancellations')}</h2>
        <div className="space-y-1">
          <label htmlFor="notice_hours_full" className="block text-sm font-medium text-gray-700">
            {t('noticeHoursFull')}
          </label>
          <p className="text-xs text-muted-foreground">{t('noticeHoursFullHint')}</p>
          <input
            id="notice_hours_full"
            name="notice_hours_full"
            type="number"
            min="1"
            step="1"
            value={fullHours}
            onChange={(e) => setFullHours(e.target.value)}
            disabled={readOnly}
            className={INPUT}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="notice_hours_partial" className="block text-sm font-medium text-gray-700">
            {t('noticeHoursPartial')}
          </label>
          <p className="text-xs text-muted-foreground">{t('noticeHoursPartialHint')}</p>
          <input
            id="notice_hours_partial"
            name="notice_hours_partial"
            type="number"
            min="0"
            step="1"
            value={partialHours}
            onChange={(e) => setPartialHours(e.target.value)}
            disabled={readOnly}
            className={INPUT}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="partial_charge_percent" className="block text-sm font-medium text-gray-700">
            {t('partialChargePercent')}
          </label>
          <p className="text-xs text-muted-foreground">{t('partialChargePercentHint')}</p>
          <input
            id="partial_charge_percent"
            name="partial_charge_percent"
            type="number"
            min="0"
            max="100"
            step="1"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            disabled={readOnly}
            className={INPUT}
          />
        </div>
      </section>

      {/* ── No-shows ────────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-5" aria-labelledby="policy-no-show">
        <h2 id="policy-no-show" className="text-sm font-semibold text-gray-900">{t('sections.noShow')}</h2>
        <div className="space-y-1">
          <label htmlFor="no_show_charge_percent" className="block text-sm font-medium text-gray-700">
            {t('noShowPercent')}
          </label>
          <p className="text-xs text-muted-foreground">{t('noShowPercentHint')}</p>
          <input
            id="no_show_charge_percent"
            name="no_show_charge_percent"
            type="number"
            min="0"
            max="100"
            step="1"
            value={noShowPercent}
            onChange={(e) => setNoShowPercent(e.target.value)}
            disabled={readOnly}
            className={INPUT}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="no_show_pack_action" className="block text-sm font-medium text-gray-700">
            {t('noShowPackAction')}
          </label>
          <select id="no_show_pack_action" name="no_show_pack_action" defaultValue={collection.noShowPackAction} disabled={readOnly} className={INPUT}>
            <option value="consume">{t('packActions.consume')}</option>
            <option value="charge">{t('packActions.charge')}</option>
          </select>
        </div>
      </section>

      {/* ── Punch cards ─────────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-5" aria-labelledby="policy-packs">
        <h2 id="policy-packs" className="text-sm font-semibold text-gray-900">{t('sections.packs')}</h2>
        {/* Collecting through punch cards is an org choice, not something
            inferred from having a catalog (decision #46). */}
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="pack_collection_enabled"
            defaultChecked={collection.packCollectionEnabled}
            disabled={readOnly}
            className="mt-0.5 size-4 accent-blue-600"
          />
          <span>
            {t('packCollectionEnabled')}
            <span className="block text-xs text-muted-foreground">
              {billingMode === 'monthly' ? t('packCollectionMonthlyHint') : t('packCollectionEnabledHint')}
            </span>
          </span>
        </label>
        <div className="space-y-1">
          <label htmlFor="pack_scope" className="block text-sm font-medium text-gray-700">{t('packScope')}</label>
          <select id="pack_scope" name="pack_scope" defaultValue={collection.packScope} disabled={readOnly} className={INPUT}>
            <option value="student">{t('packScopes.student')}</option>
            <option value="family">{t('packScopes.family')}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="pack_activation" className="block text-sm font-medium text-gray-700">{t('packActivation')}</label>
          {billingMode === 'monthly' && <p className="text-xs text-muted-foreground">{t('packActivationMonthlyHint')}</p>}
          <select id="pack_activation" name="pack_activation" defaultValue={collection.packActivation} disabled={readOnly} className={INPUT}>
            <option value="immediate">{t('packActivations.immediate')}</option>
            <option value="on_payment">{t('packActivations.on_payment')}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="late_cancel_pack_action" className="block text-sm font-medium text-gray-700">
            {t('lateCancelPackAction')}
          </label>
          <p className="text-xs text-muted-foreground">{t('lateCancelPackActionHint')}</p>
          <select id="late_cancel_pack_action" name="late_cancel_pack_action" defaultValue={collection.lateCancelPackAction} disabled={readOnly} className={INPUT}>
            <option value="consume">{t('lateCancelActions.consume')}</option>
            <option value="charge">{t('lateCancelActions.charge')}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="pack_low_balance_threshold" className="block text-sm font-medium text-gray-700">
            {t('lowBalanceThreshold')}
          </label>
          <p className="text-xs text-muted-foreground">{t('lowBalanceThresholdHint')}</p>
          <input
            id="pack_low_balance_threshold"
            name="pack_low_balance_threshold"
            type="number"
            min="0"
            max="100"
            step="1"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            disabled={readOnly}
            className={INPUT}
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="pack_notifications_enabled"
            defaultChecked={collection.packNotificationsEnabled}
            disabled={readOnly}
            className="mt-0.5 size-4 accent-blue-600"
          />
          <span>
            {t('notificationsEnabled')}
            <span className="block text-xs text-muted-foreground">{t('notificationsEnabledHint')}</span>
          </span>
        </label>
      </section>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 space-y-1">
        <p className="font-medium text-gray-700">{t('howItWorks')}</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>{t('ruleNoCharge', { hours: full })}</li>
          <li>{t('rulePartial', { partialHours: partial, fullHours: full, percent: pct })}</li>
          <li>{t('ruleFull', { hours: partial })}</li>
          <li>{noShowPct > 0 ? t('ruleNoShow', { percent: noShowPct }) : t('ruleNoShowFree')}</li>
          <li>{t('rulePrecedence')}</li>
        </ul>
      </div>

      {!readOnly && (
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : t('saveButton')}
        </Button>
      )}
    </form>
  )
}
