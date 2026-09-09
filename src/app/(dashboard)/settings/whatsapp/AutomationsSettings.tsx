'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { saveAutomationSettings, type AutomationSettingsResult } from './automations-actions'

type OrgAutomations = {
  automation_lesson_reminder_enabled:   boolean
  automation_exam_good_luck_enabled:    boolean
  exam_good_luck_hour:                  number
  exam_good_luck_hours_before:          number
  automation_cancellation_enabled:      boolean
  automation_payment_request_enabled:   boolean
  automation_dunning_enabled:           boolean
  automation_new_leads_enabled:         boolean
  payment_confirmation_default_enabled: boolean
  automation_lesson_reminder_hours:     number
  ai_assistant_enabled:                 boolean
}

// Labels and descriptions live in the catalog under
// `settings.automations.flows.<key>` — the key is the single source of truth
// here so the two never drift.
const FLOWS = [
  { key: 'automation_lesson_reminder_enabled' as const, hasHours: true, hasExamTiming: false },
  { key: 'automation_exam_good_luck_enabled' as const, hasHours: false, hasExamTiming: true },
  { key: 'automation_cancellation_enabled' as const, hasHours: false, hasExamTiming: false },
  { key: 'automation_payment_request_enabled' as const, hasHours: false, hasExamTiming: false },
  { key: 'automation_dunning_enabled' as const, hasHours: false, hasExamTiming: false },
  { key: 'payment_confirmation_default_enabled' as const, hasHours: false, hasExamTiming: false },
  { key: 'automation_new_leads_enabled' as const, hasHours: false, hasExamTiming: false },
  { key: 'ai_assistant_enabled' as const, hasHours: false, hasExamTiming: false },
]

/** Org-local hour of the morning send, and how far ahead of a known exam time. */
const EXAM_MORNING_HOURS = [6, 7, 8, 9]
const EXAM_HOURS_BEFORE = [1, 2, 3]

const initialState: AutomationSettingsResult = { error: null }

export function AutomationsSettings({
  org,
  aiAssistantOnPlan = true,
  readOnly = false,
  readOnlyReason,
}: {
  org: OrgAutomations
  /**
   * The AI assistant is a separate plan entitlement that happens to be toggled
   * from this page. Off-plan, the row is disabled with the reason rather than
   * silently accepting a switch the save will refuse (UX audit F4/F7).
   */
  aiAssistantOnPlan?: boolean
  readOnly?: boolean
  readOnlyReason?: string
}) {
  const t = useTranslations('settings.automations')
  const [state, formAction, isPending] = useActionState(saveAutomationSettings, initialState)

  /** Why a given row cannot be touched, or null when it can. */
  const blockedReason = (key: (typeof FLOWS)[number]['key']): string | null => {
    if (readOnly) return readOnlyReason ?? null
    if (key === 'ai_assistant_enabled' && !aiAssistantOnPlan) return t('aiNotOnPlanHint')
    return null
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">{t('title')}</h2>
      <p className="text-sm text-muted-foreground mb-6">{t('subtitle')}</p>

      <form action={formAction} className="space-y-0">
        {FLOWS.map((flow, i) => (
          <div
            key={flow.key}
            className={`flex items-start justify-between gap-4 py-4 ${
              i < FLOWS.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            <div className="flex-1 min-w-0">
              {/* A real <label>, not aria-labelledby on a <p>: it names the
                  switch for assistive tech AND makes the row text tappable. */}
              <label
                htmlFor={flow.key}
                className="block text-sm font-medium text-gray-900 cursor-pointer"
              >
                {t(`flows.${flow.key}.label`)}
              </label>
              <p id={`${flow.key}-description`} className="text-xs text-muted-foreground mt-0.5">
                {t(`flows.${flow.key}.description`)}
              </p>

              {/* Never a disabled control with no explanation — the rule the
                  audit found AutoSendToggle already following and this form not. */}
              {blockedReason(flow.key) && (
                <p id={`${flow.key}-blocked`} className="mt-1.5 text-xs text-amber-700">
                  {blockedReason(flow.key)}
                </p>
              )}

              {flow.hasHours && org[flow.key] && (
                <div className="mt-2 flex items-center gap-2">
                  <label
                    htmlFor="automation_lesson_reminder_hours"
                    className="text-xs text-muted-foreground"
                  >
                    {t('sendLabel')}
                  </label>
                  <select
                    id="automation_lesson_reminder_hours"
                    name="automation_lesson_reminder_hours"
                    defaultValue={org.automation_lesson_reminder_hours}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                  >
                    {[24, 12, 2].map((h) => (
                      <option key={h} value={h}>
                        {t('hoursBefore', { h })}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {flow.hasExamTiming && org[flow.key] && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="exam_good_luck_hour"
                      className="text-xs text-muted-foreground"
                    >
                      {t('examMorningHourLabel')}
                    </label>
                    <select
                      id="exam_good_luck_hour"
                      name="exam_good_luck_hour"
                      defaultValue={org.exam_good_luck_hour}
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                    >
                      {EXAM_MORNING_HOURS.map((h) => (
                        <option key={h} value={h}>
                          {t('examMorningHourOption', { h })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="exam_good_luck_hours_before"
                      className="text-xs text-muted-foreground"
                    >
                      {t('examHoursBeforeLabel')}
                    </label>
                    <select
                      id="exam_good_luck_hours_before"
                      name="exam_good_luck_hours_before"
                      defaultValue={org.exam_good_luck_hours_before}
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                    >
                      {EXAM_HOURS_BEFORE.map((h) => (
                        <option key={h} value={h}>
                          {t('hoursBefore', { h })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <label
              htmlFor={flow.key}
              className={`relative inline-flex items-center shrink-0 mt-0.5 ${
                blockedReason(flow.key) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                id={flow.key}
                name={flow.key}
                value="on"
                defaultChecked={org[flow.key]}
                disabled={Boolean(blockedReason(flow.key))}
                aria-describedby={
                  blockedReason(flow.key)
                    ? `${flow.key}-description ${flow.key}-blocked`
                    : `${flow.key}-description`
                }
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-700" />
            </label>
          </div>
        ))}

        {/* hidden fallback so unchecked boxes still submit hours */}
        <input type="hidden" name="automation_lesson_reminder_hours" value={org.automation_lesson_reminder_hours} />
        <input type="hidden" name="exam_good_luck_hour" value={org.exam_good_luck_hour} />
        <input type="hidden" name="exam_good_luck_hours_before" value={org.exam_good_luck_hours_before} />

        <div className="pt-4 flex items-center justify-between">
          {state.error ? (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          ) : readOnly && readOnlyReason ? (
            <p id="automations-readonly" className="text-sm text-muted-foreground">
              {readOnlyReason}
            </p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={isPending || readOnly}
            aria-describedby={readOnly ? 'automations-readonly' : undefined}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </div>
  )
}
