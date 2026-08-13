'use client'

import { useActionState } from 'react'
import { saveAutomationSettings, type AutomationSettingsResult } from './automations-actions'

type OrgAutomations = {
  automation_lesson_reminder_enabled:  boolean
  automation_cancellation_enabled:     boolean
  automation_payment_request_enabled:  boolean
  automation_dunning_enabled:          boolean
  automation_new_leads_enabled:        boolean
  automation_lesson_reminder_hours:    number
  ai_assistant_enabled:                boolean
}

const FLOWS = [
  {
    key: 'automation_lesson_reminder_enabled' as const,
    label: 'תזכורת לשיעור',
    description: 'שליחת הודעת WhatsApp להורה לפני השיעור',
    hasHours: true,
  },
  {
    key: 'automation_cancellation_enabled' as const,
    label: 'ביטול שיעור דרך WhatsApp',
    description: 'הורים יכולים לבטל שיעורים בשיחה עם הבוט',
    hasHours: false,
  },
  {
    key: 'automation_payment_request_enabled' as const,
    label: 'בקשת תשלום אחרי שיעור',
    description: 'שליחת לינק תשלום אוטומטי לאחר השיעור',
    hasHours: false,
  },
  {
    key: 'automation_dunning_enabled' as const,
    label: 'הודעות גביה',
    description: 'תזכורות חוב אוטומטיות ב-3, 7 ו-14 יום (ברירת מחדל: כבוי)',
    hasHours: false,
  },
  {
    key: 'automation_new_leads_enabled' as const,
    label: 'מענה לפניות חדשות',
    description: 'תגובה אוטומטית להורים שפונים בפעם הראשונה',
    hasHours: false,
  },
  {
    key: 'ai_assistant_enabled' as const,
    label: 'AI Assistant',
    description: 'מענה חופשי בשפה טבעית לשאלות שאינן מכוסות בפלואים הקיימים',
    hasHours: false,
  },
]

const initialState: AutomationSettingsResult = { error: null }

export function AutomationsSettings({ org }: { org: OrgAutomations }) {
  const [state, formAction, isPending] = useActionState(saveAutomationSettings, initialState)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">אוטומציות WhatsApp</h2>
      <p className="text-sm text-gray-500 mb-6">בחר אילו פלואים פעילים עבור הארגון שלך</p>

      <form action={formAction} className="space-y-0">
        {FLOWS.map((flow, i) => (
          <div
            key={flow.key}
            className={`flex items-start justify-between gap-4 py-4 ${
              i < FLOWS.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{flow.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{flow.description}</p>

              {flow.hasHours && org[flow.key] && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-gray-500">שליחה</label>
                  <select
                    name="automation_lesson_reminder_hours"
                    defaultValue={org.automation_lesson_reminder_hours}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                  >
                    <option value={24}>24 שעות לפני</option>
                    <option value={12}>12 שעות לפני</option>
                    <option value={2}>2 שעות לפני</option>
                  </select>
                </div>
              )}
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                name={flow.key}
                value="on"
                defaultChecked={org[flow.key]}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600" />
            </label>
          </div>
        ))}

        {/* hidden fallback so unchecked boxes still submit hours */}
        <input type="hidden" name="automation_lesson_reminder_hours" value={org.automation_lesson_reminder_hours} />

        <div className="pt-4 flex items-center justify-between">
          {state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          {!state.error && (
            <span />
          )}
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'שומר…' : 'שמור הגדרות'}
          </button>
        </div>
      </form>
    </div>
  )
}
