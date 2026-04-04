'use client'

import { useActionState } from 'react'
import type { ActionState } from '@/app/(admin)/admin/orgs/actions'

const TIMEZONES = [
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
]

interface Props {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
}

export function NewOrganizationForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null)

  return (
    <form action={formAction} className="space-y-5 max-w-lg">
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">שם הארגון</label>
        <input
          name="name"
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="לדוגמה: מרכז לימוד רמת גן"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">אזור זמן</label>
        <select
          name="timezone"
          defaultValue="Asia/Jerusalem"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      <hr className="border-gray-100" />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">אימייל הבעלים</label>
        <input
          name="owner_email"
          type="email"
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="owner@example.com"
          dir="ltr"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא של הבעלים</label>
        <input
          name="owner_full_name"
          required
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="ישראל ישראלי"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-indigo-600 text-white text-sm font-medium px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'יוצר...' : 'צור ארגון'}
      </button>
    </form>
  )
}
